import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';

import { Test, TestingModule } from '@nestjs/testing';

import {
  MikroORM,
} from '@mikro-orm/postgresql';

import { AppModule } from '../../src/app.module.js';

import {
  UNIT_OF_WORK,
  type UnitOfWork,
} from '../../src/shared/application/ports/unit-of-work.js';

import { Money } from '../../src/shared/domain/value-objects/money.vo.js';
import { WalletId } from '../../src/shared/domain/value-objects/wallet-id.vo.js';
import { Wallet } from '../../src/shared/domain/entities/wallet.entity.js';

import {
  WALLET_REPOSITORY,
  type WalletRepository,
} from '../../src/modules/wallet/domain/repositories/wallet.repository.js';

import {
  WALLET_LEDGER_REPOSITORY,
  type WalletLedgerRepository,
} from '../../src/modules/wallet/domain/repositories/wallet-ledger.repository.js';



import { WagerTransactionRepository } from '../../src/modules/wagering/domain/repositories/wager-transaction.repository.js';

import { WagerTransactionKind } from '../../src/modules/wagering/domain/enums/wager-transaction-kind.enum.js';

import { ProcessWagerTransactionUseCase } from '../../src/modules/wagering/application/use-cases/process-wager-transaction.use-case.js';

import { WalletOrmEntity } from '../../src/modules/wallet/infrastructure/persistence/mikro-orm/entities/wallet.orm-entity.js';

import { WalletLedgerOrmEntity } from '../../src/modules/wallet/infrastructure/persistence/mikro-orm/entities/wallet-ledger.orm-entity.js';

import { WagerTransactionOrmEntity } from '../../src/modules/wagering/infrastructure/persistence/mikro-orm/entities/wager-transaction.orm-entity.js';

import { OutboxMessageRepository } from '../../src/modules/messaging/domain/repositories/outbox-message.repository.js';

import { OutboxMessageOrmEntity } from '../../src/modules/messaging/infrastructure/persistence/mikro-orm/entities/outbox-message.orm-entity.js';

describe(
  'Wager idempotency concurrency',
  () => {
    let moduleRef: TestingModule;

    let orm: MikroORM;

    let unitOfWork: UnitOfWork;

    let walletRepository: WalletRepository;

    let walletLedgerRepository:
      WalletLedgerRepository;

    let wagerTransactionRepository:
      WagerTransactionRepository;

    let outboxRepository:
      OutboxMessageRepository;

    let useCase:
      ProcessWagerTransactionUseCase;

    beforeAll(async () => {
      moduleRef =
        await Test.createTestingModule({
          imports: [AppModule],
        }).compile();

      await moduleRef.init();

      orm = moduleRef.get(MikroORM);

      unitOfWork = moduleRef.get(
        UNIT_OF_WORK,
      );

      walletRepository = moduleRef.get(
        WALLET_REPOSITORY,
      );

        walletLedgerRepository =
            moduleRef.get(
                WALLET_LEDGER_REPOSITORY,
            );

      wagerTransactionRepository =
        moduleRef.get(
          WagerTransactionRepository,
        );

      outboxRepository = moduleRef.get(
        OutboxMessageRepository,
      );

      useCase =
        new ProcessWagerTransactionUseCase(
          walletRepository,
          walletLedgerRepository,
          wagerTransactionRepository,
          unitOfWork,
          outboxRepository,
        );
    });

    beforeEach(async () => {
      const em = orm.em.fork();

      await em.nativeDelete(
        OutboxMessageOrmEntity,
        {},
      );

      await em.nativeDelete(
        WalletLedgerOrmEntity,
        {},
      );

      await em.nativeDelete(
        WagerTransactionOrmEntity,
        {},
      );

      await em.nativeDelete(
        WalletOrmEntity,
        {},
      );
    });

    afterAll(async () => {
      await moduleRef.close();
    });

    it(
      'should process the same wager concurrently only once',
      async () => {
        const walletId =
          WalletId.create();

        const wallet =
          Wallet.rehydrate({
            id: walletId,

            playerId:
              'player-concurrent',

            currency: 'BRL',

            balance: Money.from({
              amount: '100.00',
              currency: 'BRL',
            }),

            version: 1,

            createdAt: new Date(),

            updatedAt: new Date(),
          });

        await unitOfWork.execute(
          async () => {
            await walletRepository.add(
              wallet,
            );
          },
        );

        const input = {
          providerId:
            'provider-a',

          externalTransactionId:
            'transaction-concurrent-1',

          idempotencyKey:
            'provider-a:transaction-concurrent-1',

          payloadHash:
            'hash-concurrent-1',

          walletId:
            walletId.toString(),

          playerId:
            'player-concurrent',

          roundId:
            'round-concurrent-1',

          gameId:
            'game-concurrent-1',

          kind:
            WagerTransactionKind.Bet,

          amount: '25.00',

          currency: 'BRL',
        };

        const [first, second] =
          await Promise.all([
            useCase.execute(input),
            useCase.execute(input),
          ]);

        const results = [
          first,
          second,
        ];

        const processedResults =
          results.filter(
            (result) =>
              !result.idempotentReplay,
          );

        const replayResults =
          results.filter(
            (result) =>
              result.idempotentReplay,
          );

        expect(
          processedResults,
        ).toHaveLength(1);

        expect(
          replayResults,
        ).toHaveLength(1);

        /*
         * Não usamos a mesma instância de
         * EntityManager utilizada durante
         * o processamento para conferir
         * o estado final.
         */
        const verificationEm =
          orm.em.fork();

        const persistedWallet =
          await verificationEm.findOne(
            WalletOrmEntity,
            {
              id: walletId.toString(),
            },
          );

        expect(
          persistedWallet,
        ).not.toBeNull();

        expect(
          persistedWallet?.balance,
        ).toBe('75.00');

        const transactions =
          await verificationEm.find(
            WagerTransactionOrmEntity,
            {
              providerId:
                'provider-a',

              idempotencyKey:
                'provider-a:transaction-concurrent-1',
            },
          );

        expect(
          transactions,
        ).toHaveLength(1);

        const ledgerEntries =
          await verificationEm.find(
            WalletLedgerOrmEntity,
            {
              walletId:
                walletId.toString(),
            },
          );

        expect(
          ledgerEntries,
        ).toHaveLength(1);

        const outboxMessages =
          await verificationEm.find(
            OutboxMessageOrmEntity,
            {},
          );

        expect(outboxMessages)
          .toHaveLength(2);

        expect(
          outboxMessages
            .map((message) => message.eventType)
            .sort(),
        ).toEqual([
          'WagerTransactionProcessed',
          'WalletBalanceChanged',
        ]);

        expect(
          first.transactionId,
        ).toBe(
          second.transactionId,
        );

        expect(
          first.balance,
        ).toBe('75.00');

        expect(
          second.balance,
        ).toBe('75.00');
      },
    );

    it(
      'should process the same wager 50 times in parallel with only one debit',
      async () => {
        const walletId = WalletId.create();

        const wallet = Wallet.rehydrate({
          id: walletId,
          playerId: 'player-parallel-50',
          currency: 'BRL',
          balance: Money.from({
            amount: '100.00',
            currency: 'BRL',
          }),
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        await unitOfWork.execute(async () => {
          await walletRepository.add(wallet);
        });

        const input = {
          providerId: 'provider-a',
          externalTransactionId: 'transaction-parallel-50',
          idempotencyKey: 'provider-a:transaction-parallel-50',
          payloadHash: 'hash-parallel-50',
          walletId: walletId.toString(),
          playerId: 'player-parallel-50',
          roundId: 'round-parallel-50',
          gameId: 'game-parallel-50',
          kind: WagerTransactionKind.Bet,
          amount: '25.00',
          currency: 'BRL',
        };

        const results = await Promise.all(
          Array.from(
            { length: 50 },
            () => useCase.execute(input),
          ),
        );

        const processedResults = results.filter(
          (result) => result.idempotentReplay === false,
        );

        const replayResults = results.filter(
          (result) => result.idempotentReplay === true,
        );

        expect(processedResults).toHaveLength(1);
        expect(replayResults).toHaveLength(49);

        const transactionIds = new Set(
          results.map(
            (result) => result.transactionId,
          ),
        );

        expect(transactionIds.size).toBe(1);

        for (const result of results) {
          expect(result.balance).toBe('75.00');
          expect(result.currency).toBe('BRL');
        }

        const verificationEm = orm.em.fork();

        const persistedWallet =
          await verificationEm.findOne(
            WalletOrmEntity,
            {
              id: walletId.toString(),
            },
          );

        expect(persistedWallet).not.toBeNull();

        expect(
          persistedWallet?.balance,
        ).toBe('75.00');

        const transactions =
          await verificationEm.find(
            WagerTransactionOrmEntity,
            {
              providerId: 'provider-a',
              idempotencyKey:
                'provider-a:transaction-parallel-50',
            },
          );

        expect(transactions).toHaveLength(1);

        const ledgerEntries =
          await verificationEm.find(
            WalletLedgerOrmEntity,
            {
              walletId: walletId.toString(),
            },
          );

        expect(ledgerEntries).toHaveLength(1);

        const outboxMessages =
          await verificationEm.find(
            OutboxMessageOrmEntity,
            {},
          );

        expect(outboxMessages)
          .toHaveLength(2);

        expect(
          outboxMessages
            .map((message) => message.eventType)
            .sort(),
        ).toEqual([
          'WagerTransactionProcessed',
          'WalletBalanceChanged',
        ]);
      },
    );

    it(
      'should process only one of two concurrent bets that compete for the same balance',
      async () => {
        const walletId = WalletId.create();

        const wallet = Wallet.rehydrate({
          id: walletId,
          playerId: 'player-balance-race',
          currency: 'BRL',
          balance: Money.from({
            amount: '100.00',
            currency: 'BRL',
          }),
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        await unitOfWork.execute(async () => {
          await walletRepository.add(wallet);
        });

        const firstInput = {
          providerId: 'provider-a',
          externalTransactionId: 'bet-race-1',
          idempotencyKey: 'provider-a:bet-race-1',
          payloadHash: 'hash-bet-race-1',
          walletId: walletId.toString(),
          playerId: 'player-balance-race',
          roundId: 'round-race-1',
          gameId: 'game-race',
          kind: WagerTransactionKind.Bet,
          amount: '80.00',
          currency: 'BRL',
        };

        const secondInput = {
          providerId: 'provider-a',
          externalTransactionId: 'bet-race-2',
          idempotencyKey: 'provider-a:bet-race-2',
          payloadHash: 'hash-bet-race-2',
          walletId: walletId.toString(),
          playerId: 'player-balance-race',
          roundId: 'round-race-2',
          gameId: 'game-race',
          kind: WagerTransactionKind.Bet,
          amount: '80.00',
          currency: 'BRL',
        };

        const [firstResult, secondResult] =
          await Promise.all([
            useCase.execute(firstInput),
            useCase.execute(secondInput),
          ]);

        const results = [
          firstResult,
          secondResult,
        ];

        const processed = results.filter(
          (result) =>
            result.status === 'PROCESSED',
        );

        const rejected = results.filter(
          (result) =>
            result.status === 'REJECTED',
        );

        expect(processed).toHaveLength(1);
        expect(rejected).toHaveLength(1);

        const verificationEm = orm.em.fork();

        const persistedWallet =
          await verificationEm.findOne(
            WalletOrmEntity,
            {
              id: walletId.toString(),
            },
          );

        expect(persistedWallet).not.toBeNull();

        expect(
          persistedWallet?.balance,
        ).toBe('20.00');

        const transactions =
          await verificationEm.find(
            WagerTransactionOrmEntity,
            {
              walletId: walletId.toString(),
            },
          );

        expect(transactions).toHaveLength(2);

        const processedTransactions =
          transactions.filter(
            (transaction) =>
              transaction.status === 'PROCESSED',
          );

        const rejectedTransactions =
          transactions.filter(
            (transaction) =>
              transaction.status === 'REJECTED',
          );

        expect(
          processedTransactions,
        ).toHaveLength(1);

        expect(
          rejectedTransactions,
        ).toHaveLength(1);

        const ledgerEntries =
          await verificationEm.find(
            WalletLedgerOrmEntity,
            {
              walletId: walletId.toString(),
            },
          );

        expect(
          ledgerEntries,
        ).toHaveLength(1);

        expect(
          ledgerEntries[0]?.amount,
        ).toBe('80.00');

        expect(
          ledgerEntries[0]?.direction,
        ).toBe('DEBIT');

        const outboxMessages =
          await verificationEm.find(
            OutboxMessageOrmEntity,
            {},
          );

        expect(outboxMessages)
          .toHaveLength(3);

        expect(
          outboxMessages
            .map((message) => message.eventType)
            .sort(),
        ).toEqual([
          'WagerTransactionProcessed',
          'WagerTransactionRejected',
          'WalletBalanceChanged',
        ]);
      },
    );
  },
);