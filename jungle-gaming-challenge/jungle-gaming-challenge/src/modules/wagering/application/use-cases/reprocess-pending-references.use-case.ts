import { randomUUID } from 'node:crypto';

import type { UnitOfWork } from '../../../../shared/application/ports/unit-of-work.js';
import type { EventContext } from '../../../../shared/domain/events/event-context.js';
import type { Wallet } from '../../../../shared/domain/entities/wallet.entity.js';
import type { WalletRepository } from '../../../wallet/domain/repositories/wallet.repository.js';
import type { WalletLedgerRepository } from '../../../wallet/domain/repositories/wallet-ledger.repository.js';
import { LedgerDirection } from '../../../wallet/domain/enums/ledger-direction.enum.js';
import { InsufficientWalletBalanceError } from '../../../wallet/domain/errors/insufficient-wallet-balance.error.js';
import { WalletConcurrencyConflictError } from '../../../wallet/domain/errors/wallet-concurrency-conflict.error.js';
import { WalletBalanceChanged } from '../../../wallet/domain/events/wallet-balance-changed.event.js';
import { OutboxMessage } from '../../../messaging/domain/entities/outbox-message.js';
import type { OutboxMessageRepository } from '../../../messaging/domain/repositories/outbox-message.repository.js';
import { WagerTransaction } from '../../domain/entities/wager-transaction.js';
import { WagerTransactionStatus } from '../../domain/enums/wager-transaction-status.enum.js';
import { WagerFailureCode } from '../../domain/enums/wager-failure-code.enum.js';
import { InvalidWagerReferenceError } from '../../domain/errors/invalid-wager-reference.error.js';
import { WagerTransactionProcessed } from '../../domain/events/wager-transaction-processed.event.js';
import { WagerTransactionRejected } from '../../domain/events/wager-transaction-rejected.event.js';
import type { WagerTransactionRepository } from '../../domain/repositories/wager-transaction.repository.js';

const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_LEASE_MS = 60_000;
const MAX_REFERENCE_ATTEMPTS = 8;

export type ReprocessPendingReferencesResult = {
  claimed: number;
  processed: number;
  pending: number;
  rejected: number;
  failed: number;
};

export class ReprocessPendingReferencesUseCase {
  constructor(
    private readonly walletRepository: WalletRepository,
    private readonly ledgerRepository: WalletLedgerRepository,
    private readonly transactionRepository: WagerTransactionRepository,
    private readonly outboxRepository: OutboxMessageRepository,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async execute(
    options: {
      now?: Date;
      batchSize?: number;
      leaseDurationMs?: number;
    } = {},
  ): Promise<ReprocessPendingReferencesResult> {
    const now = options.now ?? new Date();
    const lockId = randomUUID();
    const batchSize = this.positiveInteger(
      options.batchSize,
      DEFAULT_BATCH_SIZE,
    );
    const leaseMs = this.positiveInteger(
      options.leaseDurationMs,
      DEFAULT_LEASE_MS,
    );

    const transactions =
      await this.transactionRepository.claimPendingReferences({
        now,
        limit: batchSize,
        lockId,
        lockedUntil: new Date(now.getTime() + leaseMs),
      });

    const result: ReprocessPendingReferencesResult = {
      claimed: transactions.length,
      processed: 0,
      pending: 0,
      rejected: 0,
      failed: 0,
    };

    for (const transaction of transactions) {
      try {
        const status = await this.unitOfWork.execute(() =>
          this.reprocess(transaction, lockId, now),
        );

        if (status === WagerTransactionStatus.Processed) result.processed += 1;
        else if (status === WagerTransactionStatus.Rejected)
          result.rejected += 1;
        else result.pending += 1;
      } catch {
        result.failed += 1;
      }
    }

    return result;
  }

  private async reprocess(
    transaction: WagerTransaction,
    lockId: string,
    now: Date,
  ): Promise<WagerTransactionStatus> {
    const wallet = await this.walletRepository.findById(transaction.walletId);
    const context: EventContext = {
      correlationId: transaction.id.toString(),
      causationId: transaction.id.toString(),
      occurredAt: now,
    };

    if (!wallet) {
      return this.reject(
        transaction,
        WagerFailureCode.WalletNotFound,
        lockId,
        context,
      );
    }

    const reference =
      transaction.referenceExternalTransactionId === undefined
        ? null
        : await this.transactionRepository.findByProviderAndExternalTransactionId(
            transaction.providerId,
            transaction.referenceExternalTransactionId,
          );

    if (!reference) {
      if (transaction.referenceAttempts + 1 >= MAX_REFERENCE_ATTEMPTS) {
        return this.reject(
          transaction,
          WagerFailureCode.ReferenceNotFound,
          lockId,
          context,
          wallet,
        );
      }

      transaction.scheduleReferenceRetry(now);
      await this.transactionRepository.updateClaimedReference(
        transaction,
        lockId,
      );
      return WagerTransactionStatus.PendingReference;
    }

    try {
      transaction.assertValidReference(reference);
    } catch (error) {
      if (error instanceof InvalidWagerReferenceError) {
        return this.reject(transaction, error.code, lockId, context, wallet);
      }
      throw error;
    }

    const existingReversal =
      await this.transactionRepository.findProcessedReversal(
        reference.id.toString(),
        transaction.kind,
      );

    if (existingReversal) {
      return this.reject(
        transaction,
        WagerFailureCode.ReferenceAlreadyReversed,
        lockId,
        context,
        wallet,
      );
    }

    const expectedVersion = wallet.version;
    const direction = transaction.ledgerDirectionFor(reference);

    let entry;
    try {
      entry =
        direction === LedgerDirection.Debit
          ? wallet.debit(transaction.id.toString(), transaction.money)
          : wallet.credit(transaction.id.toString(), transaction.money);
    } catch (error) {
      if (error instanceof InsufficientWalletBalanceError) {
        return this.reject(
          transaction,
          WagerFailureCode.ReversalWouldCauseNegativeBalance,
          lockId,
          context,
          wallet,
        );
      }
      throw error;
    }

    if (!(await this.walletRepository.update(wallet, expectedVersion))) {
      throw new WalletConcurrencyConflictError();
    }

    await this.ledgerRepository.add(entry);
    transaction.markProcessed(reference.id.toString(), wallet.balance, now);

    const updated = await this.transactionRepository.updateClaimedReference(
      transaction,
      lockId,
    );
    if (!updated) throw new WalletConcurrencyConflictError();

    await this.outboxRepository.add(
      OutboxMessage.enqueue(
        WagerTransactionProcessed.from(transaction, context),
      ),
    );
    await this.outboxRepository.add(
      OutboxMessage.enqueue(WalletBalanceChanged.from(wallet, entry, context)),
    );

    return WagerTransactionStatus.Processed;
  }

  private async reject(
    transaction: WagerTransaction,
    code: WagerFailureCode,
    lockId: string,
    context: EventContext,
    wallet?: Wallet,
  ): Promise<WagerTransactionStatus> {
    const balance = wallet?.balance ?? transaction.resultingBalance;
    if (!balance) throw new Error('Cannot reject without a resulting balance');

    transaction.reject(code, balance);
    const updated = await this.transactionRepository.updateClaimedReference(
      transaction,
      lockId,
    );
    if (!updated) throw new WalletConcurrencyConflictError();

    await this.outboxRepository.add(
      OutboxMessage.enqueue(
        WagerTransactionRejected.from(transaction, context),
      ),
    );
    return WagerTransactionStatus.Rejected;
  }

  private positiveInteger(value: number | undefined, fallback: number): number {
    return value && Number.isInteger(value) && value > 0 ? value : fallback;
  }
}
