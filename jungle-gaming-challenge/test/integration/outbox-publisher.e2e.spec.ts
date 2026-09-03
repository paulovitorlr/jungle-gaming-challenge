import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  mock,
} from 'bun:test';
import { Test, TestingModule } from '@nestjs/testing';

import { EntityManager, MikroORM } from '@mikro-orm/postgresql';

import {
  DeleteMessageCommand,
  GetQueueUrlCommand,
  PurgeQueueCommand,
  ReceiveMessageCommand,
} from '@aws-sdk/client-sqs';

import { AppModule } from '../../src/app.module.js';

import {
  UNIT_OF_WORK,
  type UnitOfWork,
} from '../../src/shared/application/ports/unit-of-work.js';

import { IntegrationEventPublisher } from '../../src/modules/messaging/application/ports/integration-event-publisher.js';
import { PublishOutboxMessagesUseCase } from '../../src/modules/messaging/application/use-cases/publish-outbox-messages.use-case.js';
import { OutboxMessage } from '../../src/modules/messaging/domain/entities/outbox-message.js';
import { OutboxMessageRepository } from '../../src/modules/messaging/domain/repositories/outbox-message.repository.js';
import { OutboxMessageOrmEntity } from '../../src/modules/messaging/infrastructure/persistence/mikro-orm/entities/outbox-message.orm-entity.js';
import { MikroOrmOutboxMessageRepository } from '../../src/modules/messaging/infrastructure/persistence/mikro-orm/repositories/mikro-orm-outbox-message.repository.js';
import { SqsClientService } from '../../src/modules/messaging/infrastructure/sqs/sqs-client.service.js';

describe('Outbox publisher', () => {
  let moduleRef: TestingModule;
  let orm: MikroORM;
  let entityManager: EntityManager;
  let unitOfWork: UnitOfWork;
  let outboxRepository: OutboxMessageRepository;
  let publishOutboxMessages: PublishOutboxMessagesUseCase;
  let sqsClient: SqsClientService;
  let queueUrl: string;

  const previousPublisherEnabled = process.env.OUTBOX_PUBLISHER_ENABLED;

  beforeAll(async () => {
    process.env.OUTBOX_PUBLISHER_ENABLED = 'false';
    process.env.SQS_WAGER_CONSUMER_ENABLED = 'false';
    process.env.PENDING_REFERENCE_WORKER_ENABLED = 'false';

    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    await moduleRef.init();

    orm = moduleRef.get(MikroORM);
    entityManager = orm.em.fork();
    unitOfWork = moduleRef.get(UNIT_OF_WORK);
    outboxRepository = moduleRef.get(OutboxMessageRepository);
    publishOutboxMessages = moduleRef.get(PublishOutboxMessagesUseCase);
    sqsClient = moduleRef.get(SqsClientService);

    const response = await sqsClient.client.send(
      new GetQueueUrlCommand({
        QueueName: 'integration-events.fifo',
      }),
    );

    if (!response.QueueUrl) {
      throw new Error('Integration events queue was not found');
    }

    queueUrl = response.QueueUrl;
  });

  beforeEach(async () => {
    await sqsClient.client.send(
      new PurgeQueueCommand({
        QueueUrl: queueUrl,
      }),
    );

    entityManager = orm.em.fork();

    await entityManager.nativeDelete(OutboxMessageOrmEntity, {});
  });

  afterAll(async () => {
    try {
      await sqsClient.client.send(
        new PurgeQueueCommand({
          QueueUrl: queueUrl,
        }),
      );
    } finally {
      if (previousPublisherEnabled === undefined) {
        delete process.env.OUTBOX_PUBLISHER_ENABLED;
      } else {
        process.env.OUTBOX_PUBLISHER_ENABLED = previousPublisherEnabled;
      }

      await moduleRef.close();
    }
  });

  it('should publish an outbox message to SQS and mark it as published', async () => {
    const message = createOutboxMessage('event-sqs-123');

    await unitOfWork.execute(async () => {
      await outboxRepository.add(message);
    });

    const result = await publishOutboxMessages.execute();

    expect(result).toEqual({
      claimed: 1,
      published: 1,
      failed: 0,
    });

    const response = await sqsClient.client.send(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: 1,
        WaitTimeSeconds: 2,
        MessageAttributeNames: ['All'],
      }),
    );

    const sqsMessage = response.Messages?.[0];

    expect(sqsMessage).toBeDefined();
    expect(JSON.parse(sqsMessage!.Body!)).toEqual(message.payload);
    expect(sqsMessage?.MessageAttributes?.eventId?.StringValue).toBe(
      message.id,
    );
    expect(sqsMessage?.MessageAttributes?.eventType?.StringValue).toBe(
      message.eventType,
    );

    const persisted = await orm.em
      .fork()
      .findOneOrFail(OutboxMessageOrmEntity, {
        id: message.id,
      });

    expect(persisted.publishedAt).toBeInstanceOf(Date);
    expect(persisted.lockId).toBeNull();
    expect(persisted.lockedUntil).toBeNull();

    if (sqsMessage?.ReceiptHandle) {
      await sqsClient.client.send(
        new DeleteMessageCommand({
          QueueUrl: queueUrl,
          ReceiptHandle: sqsMessage.ReceiptHandle,
        }),
      );
    }
  });

  it('should publish a message only once when two publishers compete', async () => {
    const message = createOutboxMessage('event-concurrent-123');

    await unitOfWork.execute(async () => {
      await outboxRepository.add(message);
    });

    const firstRepository = new MikroOrmOutboxMessageRepository(orm.em.fork());
    const secondRepository = new MikroOrmOutboxMessageRepository(orm.em.fork());

    const realPublisher = moduleRef.get(IntegrationEventPublisher);
    const publish = mock((outboxMessage: OutboxMessage) =>
      realPublisher.publish(outboxMessage),
    );

    const publisher = {
      publish,
    } as unknown as IntegrationEventPublisher;

    const firstPublisher = new PublishOutboxMessagesUseCase(
      firstRepository,
      publisher,
    );
    const secondPublisher = new PublishOutboxMessagesUseCase(
      secondRepository,
      publisher,
    );

    const [firstResult, secondResult] = await Promise.all([
      firstPublisher.execute(),
      secondPublisher.execute(),
    ]);

    expect(firstResult.published + secondResult.published).toBe(1);
    expect(publish).toHaveBeenCalledTimes(1);

    const response = await sqsClient.client.send(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: 2,
      }),
    );
    expect(response.Messages).toHaveLength(1);
  });

  it('should reclaim a message after the publisher lease expires', async () => {
    const message = createOutboxMessage('event-recovery-123');

    await unitOfWork.execute(async () => {
      await outboxRepository.add(message);
    });

    const firstRepository = new MikroOrmOutboxMessageRepository(orm.em.fork());
    const secondRepository = new MikroOrmOutboxMessageRepository(orm.em.fork());
    const claimedAt = new Date();
    const lockedUntil = new Date(claimedAt.getTime() + 60_000);

    const firstClaim = await firstRepository.claimDueForPublishing({
      now: claimedAt,
      limit: 1,
      lockId: 'publisher-that-crashed',
      lockedUntil,
    });

    expect(firstClaim).toHaveLength(1);

    const claimBeforeExpiration = await secondRepository.claimDueForPublishing({
      now: new Date(lockedUntil.getTime() - 1),
      limit: 1,
      lockId: 'recovery-publisher',
      lockedUntil: new Date(lockedUntil.getTime() + 60_000),
    });

    expect(claimBeforeExpiration).toHaveLength(0);

    const claimAfterExpiration = await secondRepository.claimDueForPublishing({
      now: lockedUntil,
      limit: 1,
      lockId: 'recovery-publisher',
      lockedUntil: new Date(lockedUntil.getTime() + 60_000),
    });

    expect(claimAfterExpiration).toHaveLength(1);
    expect(claimAfterExpiration[0]?.id).toBe(message.id);
  });
});

function createOutboxMessage(id: string): OutboxMessage {
  const occurredAt = new Date(Date.now() - 1_000);

  return OutboxMessage.rehydrate({
    id,
    aggregateId: 'transaction-123',
    eventType: 'WagerTransactionProcessed',
    payload: {
      eventId: id,
      eventType: 'WagerTransactionProcessed',
      aggregateId: 'transaction-123',
      correlationId: 'correlation-123',
      occurredAt: occurredAt.toISOString(),
      version: 1,
      data: {
        transactionId: 'transaction-123',
      },
    },
    occurredAt,
    attempts: 0,
  });
}
