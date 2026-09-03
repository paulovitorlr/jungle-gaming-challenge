import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'bun:test';
import { Test, TestingModule } from '@nestjs/testing';
import { EntityManager, MikroORM } from '@mikro-orm/postgresql';

import { AppModule } from '../../src/app.module.js';

import {
  UNIT_OF_WORK,
  type UnitOfWork,
} from '../../src/shared/application/ports/unit-of-work.js';

import { UniqueConstraintViolationError } from '../../src/shared/application/errors/unique-constraint-violation.error.js';

import { InboxMessage } from '../../src/modules/messaging/domain/entities/inbox-message.js';
import { InboxMessageRepository } from '../../src/modules/messaging/domain/repositories/inbox-message.repository.js';
import { InboxMessageOrmEntity } from '../../src/modules/messaging/infrastructure/persistence/mikro-orm/entities/inbox-message.orm-entity.js';

describe('InboxMessage persistence', () => {
  let moduleRef: TestingModule;

  let orm: MikroORM;
  let entityManager: EntityManager;
  let unitOfWork: UnitOfWork;
  let inboxRepository: InboxMessageRepository;

  beforeAll(async () => {
    process.env.SQS_WAGER_CONSUMER_ENABLED = 'false';
    process.env.OUTBOX_PUBLISHER_ENABLED = 'false';
    process.env.PENDING_REFERENCE_WORKER_ENABLED = 'false';
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    await moduleRef.init();

    orm = moduleRef.get(MikroORM);
    entityManager = orm.em.fork();

    unitOfWork = moduleRef.get(UNIT_OF_WORK);

    inboxRepository = moduleRef.get(InboxMessageRepository);
  });

  beforeEach(async () => {
    await entityManager.nativeDelete(InboxMessageOrmEntity, {});
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('should persist and retrieve a processed inbox message', async () => {
    const receivedAt = new Date('2026-09-02T12:00:00.000Z');

    const processedAt = new Date('2026-09-02T12:01:00.000Z');

    const message = InboxMessage.receive({
      consumerName: 'wager-transaction-consumer',
      messageId: 'message-123',
      payloadHash: 'payload-hash',
      receivedAt,
    });

    message.markProcessed(processedAt);

    await unitOfWork.execute(async () => {
      await inboxRepository.add(message);
    });

    const persisted = await unitOfWork.execute(async () =>
      inboxRepository.findByIdentity(
        'wager-transaction-consumer',
        'message-123',
      ),
    );

    expect(persisted).not.toBeNull();
    expect(persisted?.payloadHash).toBe('payload-hash');
    expect(persisted?.receivedAt).toEqual(receivedAt);
    expect(persisted?.processedAt).toEqual(processedAt);
    expect(persisted?.isProcessed()).toBe(true);
  });

  it('should reject the same message for the same consumer', async () => {
    const firstMessage = InboxMessage.receive({
      consumerName: 'wager-transaction-consumer',
      messageId: 'duplicated-message',
      payloadHash: 'payload-hash',
    });

    const duplicatedMessage = InboxMessage.receive({
      consumerName: 'wager-transaction-consumer',
      messageId: 'duplicated-message',
      payloadHash: 'payload-hash',
    });

    await unitOfWork.execute(async () => {
      await inboxRepository.add(firstMessage);
    });

    await expect(
      unitOfWork.execute(async () => {
        await inboxRepository.add(duplicatedMessage);
      }),
    ).rejects.toBeInstanceOf(UniqueConstraintViolationError);
  });

  it('should allow the same message for different consumers', async () => {
    const firstConsumerMessage = InboxMessage.receive({
      consumerName: 'wager-consumer',
      messageId: 'shared-message',
      payloadHash: 'payload-hash',
    });

    const secondConsumerMessage = InboxMessage.receive({
      consumerName: 'audit-consumer',
      messageId: 'shared-message',
      payloadHash: 'payload-hash',
    });

    await unitOfWork.execute(async () => {
      await inboxRepository.add(firstConsumerMessage);

      await inboxRepository.add(secondConsumerMessage);
    });

    const firstPersisted = await unitOfWork.execute(async () =>
      inboxRepository.findByIdentity('wager-consumer', 'shared-message'),
    );

    const secondPersisted = await unitOfWork.execute(async () =>
      inboxRepository.findByIdentity('audit-consumer', 'shared-message'),
    );

    expect(firstPersisted).not.toBeNull();
    expect(secondPersisted).not.toBeNull();
  });
});
