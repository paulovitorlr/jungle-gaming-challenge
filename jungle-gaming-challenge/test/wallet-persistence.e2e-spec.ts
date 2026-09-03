import { Test, TestingModule } from '@nestjs/testing';
import { EntityManager, MikroORM } from '@mikro-orm/postgresql';

import { AppModule } from '../src/app.module.js';
import { Wallet } from '../src/shared/domain/entities/wallet.entity.js';
import { Money } from '../src/shared/domain/value-objects/money.vo.js';
import {
  UNIT_OF_WORK,
  type UnitOfWork,
} from '../src/shared/application/ports/unit-of-work.js';
import {
  WALLET_REPOSITORY,
  type WalletRepository,
} from '../src/modules/wallet/domain/repositories/wallet.repository.js';
import {
  WALLET_LEDGER_REPOSITORY,
  type WalletLedgerRepository,
} from '../src/modules/wallet/domain/repositories/wallet-ledger.repository.js';
import { WalletOrmEntity } from '../src/modules/wallet/infrastructure/persistence/mikro-orm/entities/wallet.orm-entity.js';
import { WalletLedgerOrmEntity } from '../src/modules/wallet/infrastructure/persistence/mikro-orm/entities/wallet-ledger.orm-entity.js';
import { WagerTransactionOrmEntity } from '../src/modules/wagering/infrastructure/persistence/mikro-orm/entities/wager-transaction.orm-entity.js';

describe('Wallet persistence', () => {
  let moduleRef: TestingModule;
  let orm: MikroORM;
  let entityManager: EntityManager;
  let unitOfWork: UnitOfWork;
  let walletRepository: WalletRepository;
  let ledgerRepository: WalletLedgerRepository;

  async function cleanDatabase(): Promise<void> {
    const em = orm.em.fork();

    await em.nativeDelete(WagerTransactionOrmEntity, {});

    await em.nativeDelete(WalletLedgerOrmEntity, {});

    await em.nativeDelete(WalletOrmEntity, {});
  }

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    await moduleRef.init();

    orm = moduleRef.get(MikroORM);
    entityManager = moduleRef.get(EntityManager);
    unitOfWork = moduleRef.get(UNIT_OF_WORK);
    walletRepository = moduleRef.get(WALLET_REPOSITORY);
    ledgerRepository = moduleRef.get(WALLET_LEDGER_REPOSITORY);
  });

  beforeEach(async () => {
    await cleanDatabase();
  });

  afterEach(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('should commit wallet and ledger together', async () => {
    const wallet = Wallet.open('player-commit', 'BRL');

    const entry = wallet.credit(
      'transaction-commit',
      Money.from({
        amount: '100.00',
        currency: 'BRL',
      }),
    );

    await unitOfWork.execute(async () => {
      await walletRepository.add(wallet);
      await ledgerRepository.add(entry);
    });

    const verificationEm = orm.em.fork();

    const persistedWallet = await verificationEm.findOne(WalletOrmEntity, {
      id: wallet.id.toString(),
    });

    const persistedLedger = await verificationEm.findOne(
      WalletLedgerOrmEntity,
      {
        id: entry.id,
      },
    );

    expect(persistedWallet).not.toBeNull();
    expect(persistedWallet?.balance).toBe('100.00');
    expect(persistedWallet?.version).toBe(2);

    expect(persistedLedger).not.toBeNull();
    expect(persistedLedger?.walletId).toBe(wallet.id.toString());
    expect(persistedLedger?.amount).toBe('100.00');
  });

  it('should roll back wallet and ledger together', async () => {
    const wallet = Wallet.open('player-rollback', 'BRL');

    const entry = wallet.credit(
      'transaction-rollback',
      Money.from({
        amount: '80.00',
        currency: 'BRL',
      }),
    );

    await expect(
      unitOfWork.execute(async () => {
        await walletRepository.add(wallet);
        await ledgerRepository.add(entry);

        // Força os INSERTs a chegarem ao PostgreSQL antes
        // do erro, provando um rollback SQL verdadeiro.
        await entityManager.flush();

        throw new Error('Forced rollback');
      }),
    ).rejects.toThrow('Forced rollback');

    const verificationEm = orm.em.fork();

    const persistedWallet = await verificationEm.findOne(WalletOrmEntity, {
      id: wallet.id.toString(),
    });

    const persistedLedger = await verificationEm.findOne(
      WalletLedgerOrmEntity,
      {
        id: entry.id,
      },
    );

    expect(persistedWallet).toBeNull();
    expect(persistedLedger).toBeNull();
  });
});
