import { InboxMessage } from '../../../../domain/entities/inbox-message.js';
import { InboxMessageOrmEntity } from '../entities/inbox-message.orm-entity.js';

export class InboxMessageMapper {
  static toPersistence(
    message: InboxMessage,
  ): InboxMessageOrmEntity {
    const entity = new InboxMessageOrmEntity();

    entity.consumerName = message.consumerName;
    entity.messageId = message.messageId;
    entity.payloadHash = message.payloadHash;
    entity.receivedAt = message.receivedAt;
    entity.processedAt = message.processedAt;

    return entity;
  }

  static toDomain(
    entity: InboxMessageOrmEntity,
  ): InboxMessage {
    return InboxMessage.rehydrate({
      consumerName: entity.consumerName,
      messageId: entity.messageId,
      payloadHash: entity.payloadHash,
      receivedAt: entity.receivedAt,
      processedAt: entity.processedAt,
    });
  }
}