import { WalletRepository } from '../../../wallet/domain/repositories/wallet.repository.js';
import { WalletLedgerRepository } from '../../../wallet/domain/repositories/wallet-ledger.repository.js';

import { Money } from '../../../../shared/domain/value-objects/money.vo.js';
import { WalletId } from '../../../../shared/domain/value-objects/wallet-id.vo.js';

import { WagerTransaction } from '../../domain/entities/wager-transaction.js';
import { WagerTransactionKind } from '../../domain/enums/wager-transaction-kind.enum.js';
import { WagerTransactionRepository } from '../../domain/repositories/wager-transaction.repository.js';

import { InsufficientWalletBalanceError } from '../../../wallet/domain/errors/insufficient-wallet-balance.error.js';
import { WalletConcurrencyConflictError } from '../../../wallet/domain/errors/wallet-concurrency-conflict.error.js';

import { UnitOfWork } from '../../../../shared/application/ports/unit-of-work.js';
import { WagerFailureCode } from '../../domain/enums/wager-failure-code.enum.js';

import { IdempotencyConflictError } from '../errors/idempotency-conflict.error.js';
import { UniqueConstraintViolationError } from '../../../../shared/application/errors/unique-constraint-violation.error.js';

import type { EventContext } from '../../../../shared/domain/events/event-context.js';

import { OutboxMessage } from '../../../messaging/domain/entities/outbox-message.js';
import { OutboxMessageRepository } from '../../../messaging/domain/repositories/outbox-message.repository.js';

import { WagerTransactionProcessed } from '../../domain/events/wager-transaction-processed.event.js';
import { WagerTransactionRejected } from '../../domain/events/wager-transaction-rejected.event.js';
import { WalletBalanceChanged } from '../../../wallet/domain/events/wallet-balance-changed.event.js';
import { LedgerDirection } from '../../../wallet/domain/enums/ledger-direction.enum.js';
import { InvalidWagerReferenceError } from '../../domain/errors/invalid-wager-reference.error.js';
import { InvalidWagerTransactionError } from '../../domain/errors/invalid-wager-transaction.error.js';
import { WagerTransactionPendingReference } from '../../domain/events/wager-transaction-pending-reference.event.js';
import type { MetricsService } from '../../../../shared/infrastructure/observability/metrics.service.js';

const MAX_CONCURRENCY_ATTEMPTS = 5;

export type ProcessWagerTransactionInput = {
  providerId: string;
  externalTransactionId: string;
  idempotencyKey: string;
  payloadHash: string;
  walletId: string;
  playerId: string;
  roundId: string;
  gameId: string;
  kind: WagerTransactionKind;
  amount: string;
  currency: string;
  referenceExternalTransactionId?: string;
  correlationId?: string;
  causationId?: string;
};

export type ProcessWagerTransactionOutput = {
  transactionId: string;
  status: string;
  balance: string;
  currency: string;
  idempotentReplay: boolean;
  failureCode?: WagerFailureCode;
};

export class ProcessWagerTransactionUseCase {
  constructor(
    private readonly walletRepository: WalletRepository,

    private readonly walletLedgerRepository: WalletLedgerRepository,

    private readonly wagerTransactionRepository: WagerTransactionRepository,

    private readonly unitOfWork: UnitOfWork,

    private readonly outboxRepository: OutboxMessageRepository,
    private readonly metrics?: MetricsService,
  ) {}

  async execute(
    input: ProcessWagerTransactionInput,
  ): Promise<ProcessWagerTransactionOutput> {
    for (let attempt = 1; attempt <= MAX_CONCURRENCY_ATTEMPTS; attempt++) {
      try {
        return await this.processAttempt(input);
      } catch (error) {
        if (error instanceof WalletConcurrencyConflictError) {
          this.metrics?.increment('wallet_lock_conflicts_total');
        }
        const isIdempotencyRace =
          error instanceof UniqueConstraintViolationError &&
          error.constraint === 'uq_wager_transactions_provider_idempotency_key';

        const shouldRetry =
          (error instanceof WalletConcurrencyConflictError ||
            isIdempotencyRace) &&
          attempt < MAX_CONCURRENCY_ATTEMPTS;

        if (shouldRetry) {
          continue;
        }

        throw error;
      }
    }

    throw new WalletConcurrencyConflictError();
  }

  private async processAttempt(
    input: ProcessWagerTransactionInput,
  ): Promise<ProcessWagerTransactionOutput> {
    return this.unitOfWork.execute(async () => {
      const existing =
        await this.wagerTransactionRepository.findByIdempotencyKey(
          input.providerId,
          input.idempotencyKey,
        );

      if (existing) {
        if (!existing.matchesPayload(input.payloadHash)) {
          throw new IdempotencyConflictError();
        }

        if (!existing.resultingBalance) {
          throw new Error('Persisted transaction has no resulting balance');
        }

        return {
          transactionId: existing.id.toString(),
          status: existing.status,
          balance: existing.resultingBalance.toString(),
          currency: existing.resultingBalance.currency,
          idempotentReplay: true,
          failureCode: existing.failureCode,
        };
      }

      const walletId = WalletId.from(input.walletId);

      const wallet = await this.walletRepository.findById(walletId);

      if (!wallet) {
        throw new Error('Wallet not found');
      }

      const transaction = WagerTransaction.create({
        providerId: input.providerId,

        externalTransactionId: input.externalTransactionId,

        idempotencyKey: input.idempotencyKey,

        payloadHash: input.payloadHash,

        walletId,
        playerId: input.playerId,
        roundId: input.roundId,
        gameId: input.gameId,
        kind: input.kind,

        money: Money.from({
          amount: input.amount,
          currency: input.currency,
        }),

        referenceExternalTransactionId: input.referenceExternalTransactionId,
      });

      if (transaction.kind === WagerTransactionKind.Opening) {
        throw new InvalidWagerTransactionError(
          'OPENING is an internal transaction kind',
        );
      }

      const eventContext = this.createEventContext(input);

      if (wallet.playerId !== transaction.playerId) {
        return this.rejectTransaction(
          transaction,
          WagerFailureCode.WalletScopeMismatch,
          wallet.balance,
          eventContext,
        );
      }

      if (wallet.currency !== transaction.money.currency) {
        return this.rejectTransaction(
          transaction,
          WagerFailureCode.CurrencyMismatch,
          wallet.balance,
          eventContext,
        );
      }

      const reference = transaction.referenceExternalTransactionId
        ? await this.wagerTransactionRepository.findByProviderAndExternalTransactionId(
            transaction.providerId,
            transaction.referenceExternalTransactionId,
          )
        : null;

      if (transaction.requiresReference() && !reference) {
        transaction.markPendingReference(wallet.balance);

        await this.wagerTransactionRepository.save(transaction);
        await this.outboxRepository.add(
          OutboxMessage.enqueue(
            WagerTransactionPendingReference.from(transaction, eventContext),
          ),
        );

        return this.toOutput(transaction, false);
      }

      if (transaction.referenceExternalTransactionId && !reference) {
        return this.rejectTransaction(
          transaction,
          WagerFailureCode.ReferenceNotFound,
          wallet.balance,
          eventContext,
        );
      }

      if (reference) {
        try {
          transaction.assertValidReference(reference);
        } catch (error) {
          if (error instanceof InvalidWagerReferenceError) {
            return this.rejectTransaction(
              transaction,
              error.code,
              wallet.balance,
              eventContext,
            );
          }

          throw error;
        }

        if (
          transaction.kind === WagerTransactionKind.Refund ||
          transaction.kind === WagerTransactionKind.Rollback
        ) {
          const existingReversal =
            await this.wagerTransactionRepository.findProcessedReversal(
              reference.id.toString(),
              transaction.kind,
            );

          if (existingReversal) {
            return this.rejectTransaction(
              transaction,
              WagerFailureCode.ReferenceAlreadyReversed,
              wallet.balance,
              eventContext,
            );
          }
        }
      }

      if (transaction.kind === WagerTransactionKind.Loss) {
        transaction.markProcessed(
          reference?.id.toString(),
          wallet.balance,
          new Date(),
        );

        await this.wagerTransactionRepository.save(transaction);
        await this.outboxRepository.add(
          OutboxMessage.enqueue(
            WagerTransactionProcessed.from(transaction, eventContext),
          ),
        );

        return this.toOutput(transaction, false);
      }

      const expectedVersion = wallet.version;

      let ledgerEntry;

      try {
        const direction = transaction.ledgerDirectionFor(
          reference ?? undefined,
        );

        ledgerEntry =
          direction === LedgerDirection.Debit
            ? wallet.debit(transaction.id.toString(), transaction.money)
            : wallet.credit(transaction.id.toString(), transaction.money);
      } catch (error) {
        if (error instanceof InsufficientWalletBalanceError) {
          const code =
            transaction.kind === WagerTransactionKind.Bet
              ? WagerFailureCode.InsufficientFunds
              : WagerFailureCode.ReversalWouldCauseNegativeBalance;

          return this.rejectTransaction(
            transaction,
            code,
            wallet.balance,
            eventContext,
          );
        }

        throw error;
      }

      const updated = await this.walletRepository.update(
        wallet,
        expectedVersion,
      );

      if (!updated) {
        throw new WalletConcurrencyConflictError();
      }

      await this.walletLedgerRepository.add(ledgerEntry);

      transaction.markProcessed(
        reference?.id.toString(),
        wallet.balance,
        new Date(),
      );

      await this.wagerTransactionRepository.save(transaction);

      const processedEvent = WagerTransactionProcessed.from(
        transaction,
        eventContext,
      );

      const balanceChangedEvent = WalletBalanceChanged.from(
        wallet,
        ledgerEntry,
        eventContext,
      );

      await this.outboxRepository.add(OutboxMessage.enqueue(processedEvent));

      await this.outboxRepository.add(
        OutboxMessage.enqueue(balanceChangedEvent),
      );

      return this.toOutput(transaction, false);
    });
  }

  private async rejectTransaction(
    transaction: WagerTransaction,
    code: WagerFailureCode,
    resultingBalance: Money,
    context: EventContext,
  ): Promise<ProcessWagerTransactionOutput> {
    transaction.reject(code, resultingBalance);

    await this.wagerTransactionRepository.save(transaction);
    await this.outboxRepository.add(
      OutboxMessage.enqueue(
        WagerTransactionRejected.from(transaction, context),
      ),
    );

    return this.toOutput(transaction, false);
  }

  private toOutput(
    transaction: WagerTransaction,
    idempotentReplay: boolean,
  ): ProcessWagerTransactionOutput {
    if (!transaction.resultingBalance) {
      throw new Error('Transaction has no resulting balance');
    }

    return {
      transactionId: transaction.id.toString(),
      status: transaction.status,
      balance: transaction.resultingBalance.toString(),
      currency: transaction.resultingBalance.currency,
      idempotentReplay,
      failureCode: transaction.failureCode,
    };
  }

  private createEventContext(
    input: ProcessWagerTransactionInput,
  ): EventContext {
    return {
      correlationId: input.correlationId ?? input.idempotencyKey,

      causationId: input.causationId,
    };
  }
}
