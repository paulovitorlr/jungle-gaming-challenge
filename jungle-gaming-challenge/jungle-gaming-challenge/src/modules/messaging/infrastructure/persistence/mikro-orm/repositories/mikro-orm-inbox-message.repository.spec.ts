import { describe, expect, it, mock } from 'bun:test';
import { EntityManager } from '@mikro-orm/postgresql';

import { InboxMessage } from '../../../../domain/entities/inbox-message.js';
import { InboxMessageOrmEntity } from '../entities/inbox-message.orm-entity.js';
import { MikroOrmInboxMessageRepository } from './mikro-orm-inbox-message.repository.js';

describe('MikroOrmInboxMessageRepository', () => {
  it('should register an inbox message without flushing', async () => {
    const entityManager = {
      persist: mock(),
      flush: mock(),
    };

    const repository = new MikroOrmInboxMessageRepository(
      entityManager as unknown as EntityManager,
    );

    const message = InboxMessage.receive({
      consumerName: 'wager-transaction-consumer',
      messageId: 'message-123',
      payloadHash: 'payload-hash',
      receivedAt: new Date('2026-09-02T12:00:00.000Z'),
    });

    await repository.add(message);

    expect(entityManager.persist).toHaveBeenCalledTimes(1);

    const persisted = entityManager.persist.mock.calls[0][0];

    expect(persisted).toBeInstanceOf(InboxMessageOrmEntity);
    expect(persisted.consumerName).toBe('wager-transaction-consumer');
    expect(persisted.messageId).toBe('message-123');

    expect(entityManager.flush).not.toHaveBeenCalled();
  });

  it('should find an inbox message by its identity', async () => {
    const entity = new InboxMessageOrmEntity();

    entity.consumerName = 'wager-transaction-consumer';
    entity.messageId = 'message-123';
    entity.payloadHash = 'payload-hash';
    entity.receivedAt = new Date('2026-09-02T12:00:00.000Z');
    entity.processedAt = new Date('2026-09-02T12:01:00.000Z');

    const entityManager = {
      findOne: mock().mockResolvedValue(entity),
    };

    const repository = new MikroOrmInboxMessageRepository(
      entityManager as unknown as EntityManager,
    );

    const result = await repository.findByIdentity(
      'wager-transaction-consumer',
      'message-123',
    );

    expect(entityManager.findOne).toHaveBeenCalledWith(InboxMessageOrmEntity, {
      consumerName: 'wager-transaction-consumer',
      messageId: 'message-123',
    });

    expect(result?.messageId).toBe('message-123');
    expect(result?.isProcessed()).toBe(true);
  });

  it('should return null when the message does not exist', async () => {
    const entityManager = {
      findOne: mock().mockResolvedValue(null),
    };

    const repository = new MikroOrmInboxMessageRepository(
      entityManager as unknown as EntityManager,
    );

    const result = await repository.findByIdentity(
      'wager-transaction-consumer',
      'missing-message',
    );

    expect(result).toBeNull();
  });
});
