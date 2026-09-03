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



const MAX_CONCURRENCY_ATTEMPTS = 2;

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
};

export class ProcessWagerTransactionUseCase {
  constructor(
    private readonly walletRepository:
      WalletRepository,

    private readonly walletLedgerRepository:
      WalletLedgerRepository,

    private readonly wagerTransactionRepository:
      WagerTransactionRepository,

    private readonly unitOfWork:
      UnitOfWork,

    private readonly outboxRepository:
      OutboxMessageRepository,
  ) {}

  async execute(
    input: ProcessWagerTransactionInput,
  ): Promise<ProcessWagerTransactionOutput> {
    for (
      let attempt = 1;
      attempt <= MAX_CONCURRENCY_ATTEMPTS;
      attempt++
    ) {
      try {
        return await this.processAttempt(input);
      } catch (error) {
        const isIdempotencyRace =
          error instanceof
            UniqueConstraintViolationError &&
          error.constraint ===
            'uq_wager_transactions_provider_idempotency_key';

        const shouldRetry =
          (
            error instanceof
              WalletConcurrencyConflictError ||
            isIdempotencyRace
          ) &&
          attempt <
            MAX_CONCURRENCY_ATTEMPTS;

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
    return this.unitOfWork.execute(
      async () => {
        const existing =
          await this.wagerTransactionRepository
            .findByIdempotencyKey(
              input.providerId,
              input.idempotencyKey,
            );

        if (existing) {
          if (
            !existing.matchesPayload(
              input.payloadHash,
            )
          ) {
            throw new IdempotencyConflictError();
          }

          const existingWallet =
            await this.walletRepository.findById(
              existing.walletId,
            );

          if (!existingWallet) {
            throw new Error(
              'Wallet not found',
            );
          }

          return {
            transactionId:
              existing.id.toString(),
            status: existing.status,
            balance:
              existingWallet.balance.toString(),
            currency:
              existingWallet.balance.currency,
            idempotentReplay: true,
          };
        }

        const walletId = WalletId.from(
          input.walletId,
        );

        const wallet =
          await this.walletRepository.findById(
            walletId,
          );

        if (!wallet) {
          throw new Error(
            'Wallet not found',
          );
        }

        const transaction =
          WagerTransaction.create({
            providerId:
              input.providerId,

            externalTransactionId:
              input.externalTransactionId,

            idempotencyKey:
              input.idempotencyKey,

            payloadHash:
              input.payloadHash,

            walletId,
            playerId: input.playerId,
            roundId: input.roundId,
            gameId: input.gameId,
            kind: input.kind,

            money: Money.from({
              amount: input.amount,
              currency: input.currency,
            }),

            referenceExternalTransactionId:
              input.referenceExternalTransactionId,
          });

        if (
          transaction.kind !==
          WagerTransactionKind.Bet
        ) {
          throw new Error(
            'Only BET processing is implemented in this step',
          );
        }

        const eventContext =
          this.createEventContext(input);

        const expectedVersion =
          wallet.version;

        let ledgerEntry;

        try {
          ledgerEntry = wallet.debit(
            transaction.id.toString(),
            transaction.money,
          );
        } catch (error) {
          if (
            error instanceof
            InsufficientWalletBalanceError
          ) {
            transaction.reject(
              WagerFailureCode
                .InsufficientFunds,
              wallet.balance,
            );

            await this
              .wagerTransactionRepository
              .save(transaction);

            const rejectedEvent =
              WagerTransactionRejected.from(
                transaction,
                eventContext,
              );

            await this.outboxRepository.add(
              OutboxMessage.enqueue(
                rejectedEvent,
              ),
            );

            return {
              transactionId:
                transaction.id.toString(),
              status:
                transaction.status,
              balance:
                wallet.balance.toString(),
              currency:
                wallet.balance.currency,
              idempotentReplay: false,
            };
          }

          throw error;
        }

        const updated =
          await this.walletRepository.update(
            wallet,
            expectedVersion,
          );

        if (!updated) {
          throw new WalletConcurrencyConflictError();
        }

        await this.walletLedgerRepository.add(
          ledgerEntry,
        );

        transaction.markProcessed(
          undefined,
          wallet.balance,
          new Date(),
        );

        await this
          .wagerTransactionRepository
          .save(transaction);

        const processedEvent =
          WagerTransactionProcessed.from(
            transaction,
            eventContext,
          );

        const balanceChangedEvent =
          WalletBalanceChanged.from(
            wallet,
            ledgerEntry,
            eventContext,
          );

        await this.outboxRepository.add(
          OutboxMessage.enqueue(
            processedEvent,
          ),
        );

        await this.outboxRepository.add(
          OutboxMessage.enqueue(
            balanceChangedEvent,
          ),
        );

        return {
          transactionId:
            transaction.id.toString(),
          status: transaction.status,
          balance:
            wallet.balance.toString(),
          currency:
            wallet.balance.currency,
          idempotentReplay: false,
        };
      },
    );
  }

  private createEventContext(
    input: ProcessWagerTransactionInput,
  ): EventContext {
    return {
      correlationId:
        input.correlationId ??
        input.idempotencyKey,

      causationId:
        input.causationId,
    };
  }
}