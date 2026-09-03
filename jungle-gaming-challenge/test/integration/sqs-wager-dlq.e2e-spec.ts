import { Test, TestingModule } from '@nestjs/testing';

import {
  EntityManager,
  MikroORM,
} from '@mikro-orm/postgresql';

import {
  DeleteMessageCommand,
  GetQueueUrlCommand,
  PurgeQueueCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  SetQueueAttributesCommand,
  type Message,
} from '@aws-sdk/client-sqs';

import { AppModule } from '../../src/app.module.js';

import {
  UNIT_OF_WORK,
  type UnitOfWork,
} from '../../src/shared/application/ports/unit-of-work.js';

import { InboxMessageRepository } from '../../src/modules/messaging/domain/repositories/inbox-message.repository.js';

import { InboxMessageOrmEntity } from '../../src/modules/messaging/infrastructure/persistence/mikro-orm/entities/inbox-message.orm-entity.js';

import { SqsClientService } from '../../src/modules/messaging/infrastructure/sqs/sqs-client.service.js';

import { WagerTransactionRepository } from '../../src/modules/wagering/domain/repositories/wager-transaction.repository.js';

import { WagerTransactionOrmEntity } from '../../src/modules/wagering/infrastructure/persistence/mikro-orm/entities/wager-transaction.orm-entity.js';

import { WalletLedgerOrmEntity } from '../../src/modules/wallet/infrastructure/persistence/mikro-orm/entities/wallet-ledger.orm-entity.js';

import { WalletOrmEntity } from '../../src/modules/wallet/infrastructure/persistence/mikro-orm/entities/wallet.orm-entity.js';

describe('SQS wager DLQ', () => {
  let moduleRef: TestingModule;

  let orm: MikroORM;
  let entityManager: EntityManager;
  let unitOfWork: UnitOfWork;

  let sqsClient: SqsClientService;

  let inboxRepository:
    InboxMessageRepository;

  let wagerTransactionRepository:
    WagerTransactionRepository;

  let queueUrl: string;
  let dlqUrl: string;

  beforeAll(async () => {
    moduleRef =
      await Test.createTestingModule({
        imports: [AppModule],
      }).compile();

    await moduleRef.init();

    orm = moduleRef.get(MikroORM);
    entityManager = orm.em.fork();

    unitOfWork = moduleRef.get(
      UNIT_OF_WORK,
    );

    sqsClient = moduleRef.get(
      SqsClientService,
    );

    inboxRepository = moduleRef.get(
      InboxMessageRepository,
    );

    wagerTransactionRepository =
      moduleRef.get(
        WagerTransactionRepository,
      );

    const queueResponse =
      await sqsClient.client.send(
        new GetQueueUrlCommand({
          QueueName:
            'wager-transactions',
        }),
      );

    const dlqResponse =
      await sqsClient.client.send(
        new GetQueueUrlCommand({
          QueueName:
            'wager-transactions-dlq',
        }),
      );

    if (
      !queueResponse.QueueUrl ||
      !dlqResponse.QueueUrl
    ) {
      throw new Error(
        'SQS queue or DLQ was not found',
      );
    }

    queueUrl = queueResponse.QueueUrl;
    dlqUrl = dlqResponse.QueueUrl;
  });

  beforeEach(async () => {
    /*
     * Reduz o tempo de visibilidade e o
     * long polling somente durante este
     * teste. A configuração normal será
     * restaurada no afterAll.
     */
    await sqsClient.client.send(
      new SetQueueAttributesCommand({
        QueueUrl: queueUrl,

        Attributes: {
          VisibilityTimeout: '1',
          ReceiveMessageWaitTimeSeconds:
            '1',
        },
      }),
    );

    await sqsClient.client.send(
      new PurgeQueueCommand({
        QueueUrl: queueUrl,
      }),
    );

    await sqsClient.client.send(
      new PurgeQueueCommand({
        QueueUrl: dlqUrl,
      }),
    );

    entityManager = orm.em.fork();

    await entityManager.nativeDelete(
      InboxMessageOrmEntity,
      {},
    );

    await entityManager.nativeDelete(
      WagerTransactionOrmEntity,
      {},
    );

    await entityManager.nativeDelete(
      WalletLedgerOrmEntity,
      {},
    );

    await entityManager.nativeDelete(
      WalletOrmEntity,
      {},
    );
  });

  afterAll(async () => {
    try {
      /*
       * Restaura a configuração normal
       * definida pelo script de inicialização.
       */
      await sqsClient.client.send(
        new SetQueueAttributesCommand({
          QueueUrl: queueUrl,

          Attributes: {
            VisibilityTimeout: '30',
            ReceiveMessageWaitTimeSeconds:
              '20',
          },
        }),
      );

      await sqsClient.client.send(
        new PurgeQueueCommand({
          QueueUrl: queueUrl,
        }),
      );

      await sqsClient.client.send(
        new PurgeQueueCommand({
          QueueUrl: dlqUrl,
        }),
      );
    } finally {
      await moduleRef.close();
    }
  });

  it(
    'should move a permanently failing message to the DLQ after retries',
    async () => {
      const message = {
        messageId:
          'message-dlq-123',

        type:
          'WagerTransactionRequested',

        occurredAt:
          new Date().toISOString(),

        data: {
          providerId:
            'provider-dlq',

          externalTransactionId:
            'external-dlq-123',

          idempotencyKey:
            'provider-dlq:external-dlq-123',

          playerId:
            'missing-player',

          /*
           * A wallet não existe. Cada
           * tentativa falha e a transação
           * SQL é revertida.
           */
          walletId:
            '00000000-0000-4000-8000-000000000099',

          roundId:
            'round-dlq-123',

          gameId:
            'game-dlq-123',

          kind: 'BET',

          money: {
            amount: '25.00',
            currency: 'BRL',
          },
        },
      };

      const messageBody =
        JSON.stringify(message);

      await sqsClient.client.send(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: messageBody,
        }),
      );

      const dlqMessage =
        await waitForDlqMessage(
          sqsClient,
          dlqUrl,
        );

      expect(dlqMessage.Body).toBe(
        messageBody,
      );

      expect(
        Number(
          dlqMessage.Attributes
            ?.ApproximateReceiveCount,
        ),
      ).toBeGreaterThanOrEqual(1);

      const persistenceState =
        await unitOfWork.execute(
          async () => {
            const inbox =
              await inboxRepository
                .findByIdentity(
                  'wager-transaction-consumer',
                  message.messageId,
                );

            const wager =
              await wagerTransactionRepository
                .findByIdempotencyKey(
                  message.data.providerId,
                  message.data
                    .idempotencyKey,
                );

            return {
              inbox,
              wager,
            };
          },
        );

      expect(
        persistenceState.inbox,
      ).toBeNull();

      expect(
        persistenceState.wager,
      ).toBeNull();

      if (dlqMessage.ReceiptHandle) {
        await sqsClient.client.send(
          new DeleteMessageCommand({
            QueueUrl: dlqUrl,

            ReceiptHandle:
              dlqMessage.ReceiptHandle,
          }),
        );
      }
    },
    75_000,
  );
});

async function waitForDlqMessage(
  sqsClient: SqsClientService,
  dlqUrl: string,
  timeoutMs = 60_000,
): Promise<Message> {
  const deadline =
    Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const response =
      await sqsClient.client.send(
        new ReceiveMessageCommand({
          QueueUrl: dlqUrl,

          MaxNumberOfMessages: 1,

          WaitTimeSeconds: 1,

          MessageSystemAttributeNames: [
            'ApproximateReceiveCount',
          ],
        }),
      );

    const message =
      response.Messages?.[0];

    if (message) {
      return message;
    }
  }

  throw new Error(
    `Message did not reach the DLQ within ${timeoutMs}ms`,
  );
}