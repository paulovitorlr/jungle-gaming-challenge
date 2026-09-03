import { Injectable } from '@nestjs/common';

import { LockMode } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';

import { OutboxMessage } from '../../../../domain/entities/outbox-message.js';

import { OutboxMessageRepository } from '../../../../domain/repositories/outbox-message.repository.js';

import { OutboxMessageOrmEntity } from '../entities/outbox-message.orm-entity.js';

import { OutboxMessageMapper } from '../mappers/outbox-message.mapper.js';

@Injectable()
export class MikroOrmOutboxMessageRepository
  implements OutboxMessageRepository
{
  constructor(
    private readonly entityManager:
      EntityManager,
  ) {}

  async add(
    message: OutboxMessage,
  ): Promise<void> {
    const entity =
      OutboxMessageMapper.toPersistence(
        message,
      );

    this.entityManager.persist(entity);
  }

  async findDueForPublishing(
    now: Date,
    limit: number,
  ): Promise<OutboxMessage[]> {
    const entities =
      await this.entityManager.find(
        OutboxMessageOrmEntity,
        {
          publishedAt: null,

          $or: [
            {
              nextAttemptAt: null,
            },
            {
              nextAttemptAt: {
                $lte: now,
              },
            },
          ],
        },
        {
          orderBy: {
            occurredAt: 'asc',
            id: 'asc',
          },

          limit,

          lockMode:
            LockMode.PESSIMISTIC_PARTIAL_WRITE,
        },
      );

    return entities.map(
      OutboxMessageMapper.toDomain,
    );
  }

  async update(
    message: OutboxMessage,
  ): Promise<void> {
    await this.entityManager.nativeUpdate(
      OutboxMessageOrmEntity,
      {
        id: message.id,
      },
      {
        attempts: message.attempts,
        nextAttemptAt:
          message.nextAttemptAt ?? null,
        publishedAt:
          message.publishedAt ?? null,
      },
    );
  }
}