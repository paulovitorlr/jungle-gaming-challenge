import { Test, TestingModule } from '@nestjs/testing';

import {
  EntityManager,
  MikroORM,
} from '@mikro-orm/postgresql';

import {
  GetQueueAttributesCommand,
  GetQueueUrlCommand,
  PurgeQueueCommand,
  SendMessageCommand,
} from '@aws-sdk/client-sqs';

import { AppModule } from '../../src/app.module.js';

import {
  UNIT_OF_WORK,
  type UnitOfWork,
} from '../../src/shared/application/ports/unit-of-work.js';

import { Money } from '../../src/shared/domain/value-objects/money.vo.js';
import { Wallet } from '../../src/shared/domain/entities/wallet.entity.js';

import {
  WALLET_REPOSITORY,
  type WalletRepository,
} from '../../src/modules/wallet/domain/repositories/wallet.repository.js';

import {
  WALLET_LEDGER_REPOSITORY,
  type WalletLedgerRepository,
} from '../../src/modules/wallet/domain/repositories/wallet-ledger.repository.js';

import { WagerTransactionKind } from '../../src/modules/wagering/domain/enums/wager-transaction-kind.enum.js';
import { WagerTransactionStatus } from '../../src/modules/wagering/domain/enums/wager-transaction-status.enum.js';
import { WagerTransactionRepository } from '../../src/modules/wagering/domain/repositories/wager-transaction.repository.js';

import { InboxMessageRepository } from '../../src/modules/messaging/domain/repositories/inbox-message.repository.js';
import { InboxMessageOrmEntity } from '../../src/modules/messaging/infrastructure/persistence/mikro-orm/entities/inbox-message.orm-entity.js';
import { SqsClientService } from '../../src/modules/messaging/infrastructure/sqs/sqs-client.service.js';

import { WalletOrmEntity } from '../../src/modules/wallet/infrastructure/persistence/mikro-orm/entities/wallet.orm-entity.js';
import { WalletLedgerOrmEntity } from '../../src/modules/wallet/infrastructure/persistence/mikro-orm/entities/wallet-ledger.orm-entity.js';
import { WagerTransactionOrmEntity } from '../../src/modules/wagering/infrastructure/persistence/mikro-orm/entities/wager-transaction.orm-entity.js';

describe('SQS wager consumer', () => {
  let moduleRef: TestingModule;

  let orm: MikroORM;
  let entityManager: EntityManager;
  let unitOfWork: UnitOfWork;

  let walletRepository: WalletRepository;
  let walletLedgerRepository:
    WalletLedgerRepository;

  let wagerTransactionRepository:
    WagerTransactionRepository;

  let inboxRepository:
    InboxMessageRepository;

  let sqsClient: SqsClientService;
  let queueUrl: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    await moduleRef.init();

    orm = moduleRef.get(MikroORM);
    entityManager = orm.em.fork();

    unitOfWork = moduleRef.get(UNIT_OF_WORK);

    walletRepository = moduleRef.get(
      WALLET_REPOSITORY,
    );

    walletLedgerRepository = moduleRef.get(
      WALLET_LEDGER_REPOSITORY,
    );

    wagerTransactionRepository = moduleRef.get(
      WagerTransactionRepository,
    );

    inboxRepository = moduleRef.get(
      InboxMessageRepository,
    );

    sqsClient = moduleRef.get(
      SqsClientService,
    );

    const response = await sqsClient.client.send(
      new GetQueueUrlCommand({
        QueueName: 'wager-transactions',
      }),
    );

    if (!response.QueueUrl) {
      throw new Error(
        'Wager queue was not found',
      );
    }

    queueUrl = response.QueueUrl;
  });

  beforeEach(async () => {
    await sqsClient.client.send(
      new PurgeQueueCommand({
        QueueUrl: queueUrl,
      }),
    );

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
    await moduleRef.close();
  });

  it('should debit the wallet once when the same message is delivered twice', async () => {
    const wallet = Wallet.open(
      'player-sqs',
      'BRL',
    );

    const openingEntry = wallet.credit(
      'opening-sqs',
      Money.from({
        amount: '100.00',
        currency: 'BRL',
      }),
    );

    await unitOfWork.execute(async () => {
      await walletRepository.add(wallet);

      await walletLedgerRepository.add(
        openingEntry,
      );
    });

    const message = {
      messageId: 'message-sqs-123',
      type: 'WagerTransactionRequested',
      occurredAt:
        new Date().toISOString(),

      data: {
        providerId: 'provider-sqs',
        externalTransactionId:
          'external-sqs-123',
        idempotencyKey:
          'provider-sqs:external-sqs-123',
        playerId: 'player-sqs',
        walletId: wallet.id.toString(),
        roundId: 'round-sqs-123',
        gameId: 'game-sqs-123',
        kind: WagerTransactionKind.Bet,

        money: {
          amount: '25.00',
          currency: 'BRL',
        },
      },
    };

    const messageBody = JSON.stringify(message);

    await Promise.all([
      sqsClient.client.send(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: messageBody,
        }),
      ),

      sqsClient.client.send(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: messageBody,
        }),
      ),
    ]);

    await waitUntil(async () => {
      return unitOfWork.execute(async () => {
        const inbox =
          await inboxRepository.findByIdentity(
            'wager-transaction-consumer',
            message.messageId,
          );

        return inbox?.isProcessed() ?? false;
      });
    });

    await waitUntil(async () => {
      const response =
        await sqsClient.client.send(
          new GetQueueAttributesCommand({
            QueueUrl: queueUrl,
            AttributeNames: [
              'ApproximateNumberOfMessages',
              'ApproximateNumberOfMessagesNotVisible',
            ],
          }),
        );

      return (
        response.Attributes
          ?.ApproximateNumberOfMessages ===
          '0' &&
        response.Attributes
          ?.ApproximateNumberOfMessagesNotVisible ===
          '0'
      );
    });

    const result = await unitOfWork.execute(
      async () => {
        const persistedWallet =
          await walletRepository.findById(
            wallet.id,
          );

        const transaction =
          await wagerTransactionRepository
            .findByIdempotencyKey(
              message.data.providerId,
              message.data.idempotencyKey,
            );

        const ledgerEntries =
          await walletLedgerRepository
            .findByWalletId(wallet.id);

        const inbox =
          await inboxRepository.findByIdentity(
            'wager-transaction-consumer',
            message.messageId,
          );

        return {
          persistedWallet,
          transaction,
          ledgerEntries,
          inbox,
        };
      },
    );

    expect(
      result.persistedWallet?.balance.toString(),
    ).toBe('75.00');

    expect(result.transaction?.status).toBe(
      WagerTransactionStatus.Processed,
    );

    expect(result.inbox?.isProcessed()).toBe(
      true,
    );

    const wagerLedgerEntries =
      result.ledgerEntries.filter(
        (entry) =>
          entry.transactionId ===
          result.transaction?.id.toString(),
      );

    expect(wagerLedgerEntries).toHaveLength(1);
  });
});

async function waitUntil(
  condition: () => Promise<boolean>,
  timeoutMs = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await condition()) {
      return;
    }

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 100);
    });
  }

  throw new Error(
    `Condition was not met within ${timeoutMs}ms`,
  );
}