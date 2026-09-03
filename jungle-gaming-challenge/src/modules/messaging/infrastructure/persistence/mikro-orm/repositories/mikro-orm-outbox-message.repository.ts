import { Injectable } from '@nestjs/common';

import { EntityManager } from '@mikro-orm/postgresql';

import { OutboxMessage } from '../../../../domain/entities/outbox-message.js';

import {
  type ClaimOutboxMessagesOptions,
  OutboxMessageRepository,
} from '../../../../domain/repositories/outbox-message.repository.js';

import { OutboxMessageOrmEntity } from '../entities/outbox-message.orm-entity.js';

import { OutboxMessageMapper } from '../mappers/outbox-message.mapper.js';

type ClaimedOutboxRow = {
  id: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  occurredAt: Date | string;
  attempts: number;
  nextAttemptAt: Date | string | null;
  publishedAt: Date | string | null;
};

@Injectable()
export class MikroOrmOutboxMessageRepository implements OutboxMessageRepository {
  constructor(private readonly entityManager: EntityManager) {}

  async add(message: OutboxMessage): Promise<void> {
    const entity = OutboxMessageMapper.toPersistence(message);

    this.entityManager.persist(entity);
  }

  async claimDueForPublishing(
    options: ClaimOutboxMessagesOptions,
  ): Promise<OutboxMessage[]> {
    const limit = Math.max(1, Math.trunc(options.limit));

    return this.entityManager.transactional(
      async (transactionalEntityManager) => {
        const rows = await transactionalEntityManager.execute<
          ClaimedOutboxRow[]
        >(
          `
              with due_messages as (
                select id
                from outbox_messages
                where published_at is null
                  and (
                    next_attempt_at is null
                    or next_attempt_at <= ?
                  )
                  and (
                    locked_until is null
                    or locked_until <= ?
                  )
                order by occurred_at asc, id asc
                for update skip locked
                limit ?
              )
              update outbox_messages as outbox
              set lock_id = ?, locked_until = ?
              from due_messages
              where outbox.id = due_messages.id
              returning
                outbox.id,
                outbox.aggregate_id as "aggregateId",
                outbox.event_type as "eventType",
                outbox.payload,
                outbox.occurred_at as "occurredAt",
                outbox.attempts,
                outbox.next_attempt_at as "nextAttemptAt",
                outbox.published_at as "publishedAt"
            `,
          [
            options.now,
            options.now,
            limit,
            options.lockId,
            options.lockedUntil,
          ],
        );

        return rows.map((row) =>
          OutboxMessage.rehydrate({
            id: row.id,
            aggregateId: row.aggregateId,
            eventType: row.eventType,
            payload: row.payload,
            occurredAt: new Date(row.occurredAt),
            attempts: row.attempts,
            nextAttemptAt: row.nextAttemptAt
              ? new Date(row.nextAttemptAt)
              : undefined,
            publishedAt: row.publishedAt
              ? new Date(row.publishedAt)
              : undefined,
          }),
        );
      },
    );
  }

  async updateClaimed(
    message: OutboxMessage,
    lockId: string,
  ): Promise<boolean> {
    const updatedRows = await this.entityManager.nativeUpdate(
      OutboxMessageOrmEntity,
      {
        id: message.id,
        lockId,
      },
      {
        attempts: message.attempts,
        nextAttemptAt: message.nextAttemptAt ?? null,
        publishedAt: message.publishedAt ?? null,
        lockId: null,
        lockedUntil: null,
      },
    );

    return updatedRows === 1;
  }
}
