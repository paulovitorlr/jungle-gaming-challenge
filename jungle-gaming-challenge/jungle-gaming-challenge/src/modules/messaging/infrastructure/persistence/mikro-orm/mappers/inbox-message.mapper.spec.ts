import { describe, expect, it } from 'bun:test';
import { InboxMessage } from '../../../../domain/entities/inbox-message.js';
import { InboxMessageOrmEntity } from '../entities/inbox-message.orm-entity.js';
import { InboxMessageMapper } from './inbox-message.mapper.js';

describe('InboxMessageMapper', () => {
  it('should map domain message to persistence', () => {
    const receivedAt = new Date('2026-09-02T12:00:00.000Z');

    const message = InboxMessage.receive({
      consumerName: 'wager-transaction-consumer',
      messageId: 'message-123',
      payloadHash: 'payload-hash',
      receivedAt,
    });

    const entity = InboxMessageMapper.toPersistence(message);

    expect(entity).toBeInstanceOf(InboxMessageOrmEntity);
    expect(entity.consumerName).toBe('wager-transaction-consumer');
    expect(entity.messageId).toBe('message-123');
    expect(entity.payloadHash).toBe('payload-hash');
    expect(entity.receivedAt).toEqual(receivedAt);
    expect(entity.processedAt).toBeUndefined();
  });

  it('should map persistence entity to domain', () => {
    const receivedAt = new Date('2026-09-02T12:00:00.000Z');

    const processedAt = new Date('2026-09-02T12:01:00.000Z');

    const entity = new InboxMessageOrmEntity();

    entity.consumerName = 'wager-transaction-consumer';
    entity.messageId = 'message-123';
    entity.payloadHash = 'payload-hash';
    entity.receivedAt = receivedAt;
    entity.processedAt = processedAt;

    const message = InboxMessageMapper.toDomain(entity);

    expect(message.consumerName).toBe('wager-transaction-consumer');
    expect(message.messageId).toBe('message-123');
    expect(message.payloadHash).toBe('payload-hash');
    expect(message.receivedAt).toEqual(receivedAt);
    expect(message.processedAt).toEqual(processedAt);
    expect(message.isProcessed()).toBe(true);
  });
});
