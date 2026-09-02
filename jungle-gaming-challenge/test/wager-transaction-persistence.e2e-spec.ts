import { Test, TestingModule } from '@nestjs/testing';
import {
  EntityManager,
  MikroORM,
} from '@mikro-orm/postgresql';

import {
  UNIT_OF_WORK,
  type UnitOfWork,
} from '../src/shared/application/ports/unit-of-work.js';

import { AppModule } from '../src/app.module.js';

import { Money } from '../src/shared/domain/value-objects/money.vo.js';
import { Wallet } from '../src/shared/domain/entities/wallet.entity.js';
import { WalletId } from '../src/shared/domain/value-objects/wallet-id.vo.js';

import {
  WALLET_REPOSITORY,
  type WalletRepository,
} from '../src/modules/wallet/domain/repositories/wallet.repository.js';

import { WagerTransaction } from '../src/modules/wagering/domain/entities/wager-transaction.js';
import { WagerTransactionKind } from '../src/modules/wagering/domain/enums/wager-transaction-kind.enum.js';
import { WagerTransactionRepository } from '../src/modules/wagering/domain/repositories/wager-transaction.repository.js';

import { WalletOrmEntity } from '../src/modules/wallet/infrastructure/persistence/mikro-orm/entities/wallet.orm-entity.js';
import { WalletLedgerOrmEntity } from '../src/modules/wallet/infrastructure/persistence/mikro-orm/entities/wallet-ledger.orm-entity.js';
import { WagerTransactionOrmEntity } from '../src/modules/wagering/infrastructure/persistence/mikro-orm/entities/wager-transaction.orm-entity.js';

describe('WagerTransaction persistence', () => {
  let moduleRef: TestingModule;

  let orm: MikroORM;
  let entityManager: EntityManager;

  let unitOfWork: UnitOfWork;
  let walletRepository: WalletRepository;
  let wagerTransactionRepository: WagerTransactionRepository;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    await moduleRef.init();

    orm = moduleRef.get(MikroORM);

    entityManager = orm.em.fork();

    unitOfWork = moduleRef.get(
      UNIT_OF_WORK,
    );

    walletRepository = moduleRef.get(
      WALLET_REPOSITORY,
    );

    wagerTransactionRepository = moduleRef.get(
      WagerTransactionRepository,
    );
  });

  beforeEach(async () => {
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

  it('should persist and retrieve a wager transaction', async () => {
    const walletId = WalletId.create();

    const wallet = Wallet.rehydrate({
      id: walletId,
      playerId: 'player-123',
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

    const transaction =
      WagerTransaction.create({
        providerId: 'provider-a',
        externalTransactionId:
          'transaction-123',
        idempotencyKey:
          'provider-a:transaction-123',
        payloadHash: 'hash-123',
        walletId,
        playerId: 'player-123',
        roundId: 'round-123',
        gameId: 'game-123',
        kind: WagerTransactionKind.Bet,
        money: Money.from({
          amount: '25.00',
          currency: 'BRL',
        }),
      });

    await unitOfWork.execute(async () => {
      await wagerTransactionRepository.save(
        transaction,
      );
    });

    const {
      byId,
      byIdempotencyKey,
      byProviderAndExternal,
    } = await unitOfWork.execute(async () => {
      const byId =
        await wagerTransactionRepository.findById(
          transaction.id,
        );

      const byIdempotencyKey =
        await wagerTransactionRepository.findByIdempotencyKey(
          transaction.idempotencyKey,
        );

      const byProviderAndExternal =
        await wagerTransactionRepository.findByProviderAndExternalTransactionId(
          transaction.providerId,
          transaction.externalTransactionId,
        );

      return {
        byId,
        byIdempotencyKey,
        byProviderAndExternal,
      };
    });

    expect(byId).not.toBeNull();

    expect(
      byId?.id.equals(transaction.id),
    ).toBe(true);

    expect(byIdempotencyKey).not.toBeNull();

    expect(
      byIdempotencyKey?.id.equals(
        transaction.id,
      ),
    ).toBe(true);

    expect(byProviderAndExternal).not.toBeNull();

    expect(
      byProviderAndExternal?.id.equals(
        transaction.id,
      ),
    ).toBe(true);
  });

  it('should reject duplicated idempotency key for the same provider', async () => {
    const walletId = WalletId.create();

    const firstTransaction = WagerTransaction.create({
      providerId: 'provider-a',
      externalTransactionId: 'external-1',
      idempotencyKey: 'idempotency-1',
      payloadHash: 'hash-1',
      walletId,
      playerId: 'player-1',
      roundId: 'round-1',
      gameId: 'game-1',
      kind: WagerTransactionKind.Bet,
      money: Money.from({
        amount: '10.00',
        currency: 'BRL',
      }),
    });

    const secondTransaction = WagerTransaction.create({
      providerId: 'provider-a',
      externalTransactionId: 'external-2',
      idempotencyKey: 'idempotency-1',
      payloadHash: 'hash-2',
      walletId,
      playerId: 'player-1',
      roundId: 'round-2',
      gameId: 'game-1',
      kind: WagerTransactionKind.Bet,
      money: Money.from({
        amount: '20.00',
        currency: 'BRL',
      }),
    });

    await wagerTransactionRepository.save(firstTransaction);

    await expect(
      wagerTransactionRepository.save(secondTransaction),
    ).rejects.toThrow();
  });

  it('should allow the same idempotency key for different providers', async () => {
    const walletId = WalletId.create();

    const firstTransaction = WagerTransaction.create({
      providerId: 'provider-a',
      externalTransactionId: 'external-1',
      idempotencyKey: 'same-key',
      payloadHash: 'hash-1',
      walletId,
      playerId: 'player-1',
      roundId: 'round-1',
      gameId: 'game-1',
      kind: WagerTransactionKind.Bet,
      money: Money.from({
        amount: '10.00',
        currency: 'BRL',
      }),
    });

    const secondTransaction = WagerTransaction.create({
      providerId: 'provider-b',
      externalTransactionId: 'external-2',
      idempotencyKey: 'same-key',
      payloadHash: 'hash-2',
      walletId,
      playerId: 'player-1',
      roundId: 'round-2',
      gameId: 'game-1',
      kind: WagerTransactionKind.Bet,
      money: Money.from({
        amount: '20.00',
        currency: 'BRL',
      }),
    });

    await wagerTransactionRepository.save(firstTransaction);
    await wagerTransactionRepository.save(secondTransaction);
  });

  it('should reject duplicated external transaction id for the same provider', async () => {
    const walletId = WalletId.create();

    const firstTransaction = WagerTransaction.create({
      providerId: 'provider-a',
      externalTransactionId: 'external-1',
      idempotencyKey: 'idempotency-1',
      payloadHash: 'hash-1',
      walletId,
      playerId: 'player-1',
      roundId: 'round-1',
      gameId: 'game-1',
      kind: WagerTransactionKind.Bet,
      money: Money.from({
        amount: '10.00',
        currency: 'BRL',
      }),
    });

    const secondTransaction = WagerTransaction.create({
      providerId: 'provider-a',
      externalTransactionId: 'external-1',
      idempotencyKey: 'idempotency-2',
      payloadHash: 'hash-2',
      walletId,
      playerId: 'player-1',
      roundId: 'round-2',
      gameId: 'game-1',
      kind: WagerTransactionKind.Bet,
      money: Money.from({
        amount: '20.00',
        currency: 'BRL',
      }),
    });

    await wagerTransactionRepository.save(firstTransaction);

    await expect(
      wagerTransactionRepository.save(secondTransaction),
    ).rejects.toThrow();
  });

  it('should allow the same external transaction id for different providers', async () => {
    const walletId = WalletId.create();

    const firstTransaction = WagerTransaction.create({
      providerId: 'provider-a',
      externalTransactionId: 'same-external-id',
      idempotencyKey: 'idempotency-1',
      payloadHash: 'hash-1',
      walletId,
      playerId: 'player-1',
      roundId: 'round-1',
      gameId: 'game-1',
      kind: WagerTransactionKind.Bet,
      money: Money.from({
        amount: '10.00',
        currency: 'BRL',
      }),
    });

    const secondTransaction = WagerTransaction.create({
      providerId: 'provider-b',
      externalTransactionId: 'same-external-id',
      idempotencyKey: 'idempotency-2',
      payloadHash: 'hash-2',
      walletId,
      playerId: 'player-1',
      roundId: 'round-2',
      gameId: 'game-1',
      kind: WagerTransactionKind.Bet,
      money: Money.from({
        amount: '20.00',
        currency: 'BRL',
      }),
    });

    await wagerTransactionRepository.save(firstTransaction);
    await wagerTransactionRepository.save(secondTransaction);
  });
});