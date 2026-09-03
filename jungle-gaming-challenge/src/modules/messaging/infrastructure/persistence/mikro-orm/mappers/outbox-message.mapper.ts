import { OutboxMessage } from '../../../../domain/entities/outbox-message.js';

import { OutboxMessageOrmEntity } from '../entities/outbox-message.orm-entity.js';

export class OutboxMessageMapper {
  static toPersistence(
    message: OutboxMessage,
  ): OutboxMessageOrmEntity {
    const entity =
      new OutboxMessageOrmEntity();

    entity.id = message.id;
    entity.aggregateId =
      message.aggregateId;
    entity.eventType = message.eventType;
    entity.payload = {
      ...message.payload,
    };
    entity.occurredAt =
      message.occurredAt;
    entity.attempts = message.attempts;
    entity.nextAttemptAt =
      message.nextAttemptAt;
    entity.publishedAt =
      message.publishedAt;

    return entity;
  }

  static toDomain(
    entity: OutboxMessageOrmEntity,
  ): OutboxMessage {
    return OutboxMessage.rehydrate({
      id: entity.id,
      aggregateId: entity.aggregateId,
      eventType: entity.eventType,
      payload: entity.payload,
      occurredAt: entity.occurredAt,
      attempts: entity.attempts,
      nextAttemptAt:
        entity.nextAttemptAt,
      publishedAt: entity.publishedAt,
    });
  }
}