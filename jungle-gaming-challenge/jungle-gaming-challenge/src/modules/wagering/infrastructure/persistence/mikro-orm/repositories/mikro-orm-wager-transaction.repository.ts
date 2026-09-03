import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';

import { WagerTransaction } from '../../../../domain/entities/wager-transaction.js';
import { WagerTransactionRepository } from '../../../../domain/repositories/wager-transaction.repository.js';
import { WagerTransactionId } from '../../../../domain/value-objects/wager-transaction-id.vo.js';
import { WagerTransactionKind } from '../../../../domain/enums/wager-transaction-kind.enum.js';
import { WagerTransactionStatus } from '../../../../domain/enums/wager-transaction-status.enum.js';

import { WagerTransactionOrmEntity } from '../entities/wager-transaction.orm-entity.js';
import { WagerTransactionMapper } from '../mappers/wager-transaction.mapper.js';

@Injectable()
export class MikroOrmWagerTransactionRepository
  implements WagerTransactionRepository
{
  constructor(private readonly entityManager: EntityManager) {}

  async findById(id: WagerTransactionId): Promise<WagerTransaction | null> {
    const entity = await this.entityManager.findOne(WagerTransactionOrmEntity, {
      id: id.toString(),
    });

    return entity ? WagerTransactionMapper.toDomain(entity) : null;
  }

  async findByIdempotencyKey(
    providerId: string,
    idempotencyKey: string,
  ): Promise<WagerTransaction | null> {
    const entity = await this.entityManager.findOne(WagerTransactionOrmEntity, {
      providerId,
      idempotencyKey,
    });

    return entity ? WagerTransactionMapper.toDomain(entity) : null;
  }

  async findByProviderAndExternalTransactionId(
    providerId: string,
    externalTransactionId: string,
  ): Promise<WagerTransaction | null> {
    const entity = await this.entityManager.findOne(WagerTransactionOrmEntity, {
      providerId,
      externalTransactionId,
    });

    return entity ? WagerTransactionMapper.toDomain(entity) : null;
  }

  async findProcessedReversal(
    referenceTransactionId: string,
    kind: WagerTransactionKind,
  ): Promise<WagerTransaction | null> {
    const entity = await this.entityManager.findOne(WagerTransactionOrmEntity, {
      referenceTransactionId,
      kind,
      status: WagerTransactionStatus.Processed,
    });

    return entity ? WagerTransactionMapper.toDomain(entity) : null;
  }

  async claimPendingReferences(options: {
    now: Date;
    limit: number;
    lockId: string;
    lockedUntil: Date;
  }): Promise<WagerTransaction[]> {
    const limit = Math.max(1, Math.trunc(options.limit));

    return this.entityManager.transactional(async (em) => {
      const rows = await em.execute<Array<Record<string, unknown>>>(
        `
          with due_transactions as (
            select id
            from wager_transactions
            where status = 'PENDING_REFERENCE'
              and next_reference_attempt_at <= ?
              and (
                reference_locked_until is null
                or reference_locked_until <= ?
              )
            order by next_reference_attempt_at asc, created_at asc, id asc
            for update skip locked
            limit ?
          )
          update wager_transactions as wager
          set reference_lock_id = ?, reference_locked_until = ?
          from due_transactions
          where wager.id = due_transactions.id
          returning
            wager.id,
            wager.provider_id as "providerId",
            wager.external_transaction_id as "externalTransactionId",
            wager.idempotency_key as "idempotencyKey",
            wager.payload_hash as "payloadHash",
            wager.wallet_id as "walletId",
            wager.player_id as "playerId",
            wager.round_id as "roundId",
            wager.game_id as "gameId",
            wager.kind,
            wager.amount,
            wager.currency,
            wager.reference_external_transaction_id as "referenceExternalTransactionId",
            wager.reference_transaction_id as "referenceTransactionId",
            wager.status,
            wager.failure_code as "failureCode",
            wager.created_at as "createdAt",
            wager.processed_at as "processedAt",
            wager.resulting_balance as "resultingBalance",
            wager.resulting_balance_currency as "resultingBalanceCurrency",
            wager.reference_attempts as "referenceAttempts",
            wager.next_reference_attempt_at as "nextReferenceAttemptAt",
            wager.reference_lock_id as "referenceLockId",
            wager.reference_locked_until as "referenceLockedUntil"
        `,
        [options.now, options.now, limit, options.lockId, options.lockedUntil],
      );

      return rows.map((row) => {
        const entity = Object.assign(new WagerTransactionOrmEntity(), row);
        entity.createdAt = new Date(entity.createdAt);
        entity.processedAt = entity.processedAt
          ? new Date(entity.processedAt)
          : undefined;
        entity.nextReferenceAttemptAt = entity.nextReferenceAttemptAt
          ? new Date(entity.nextReferenceAttemptAt)
          : undefined;

        return WagerTransactionMapper.toDomain(entity);
      });
    });
  }

  async updateClaimedReference(
    transaction: WagerTransaction,
    lockId: string,
  ): Promise<boolean> {
    const updatedRows = await this.entityManager.nativeUpdate(
      WagerTransactionOrmEntity,
      {
        id: transaction.id.toString(),
        referenceLockId: lockId,
      },
      {
        status: transaction.status,
        referenceTransactionId: transaction.referenceTransactionId,
        failureCode: transaction.failureCode,
        processedAt: transaction.processedAt,
        resultingBalance: transaction.resultingBalance?.toString(),
        resultingBalanceCurrency: transaction.resultingBalance?.currency,
        referenceAttempts: transaction.referenceAttempts,
        nextReferenceAttemptAt: transaction.nextReferenceAttemptAt,
        referenceLockId: null,
        referenceLockedUntil: null,
      },
    );

    return updatedRows === 1;
  }

  async save(transaction: WagerTransaction): Promise<void> {
    const entity = WagerTransactionMapper.toPersistence(transaction);

    this.entityManager.persist(entity);
  }
}
