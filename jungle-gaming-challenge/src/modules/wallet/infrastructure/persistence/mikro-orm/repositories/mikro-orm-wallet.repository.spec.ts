import { EntityManager } from '@mikro-orm/postgresql';

import { Wallet } from '../../../../../../shared/domain/entities/wallet.entity.js';
import { Money } from '../../../../../../shared/domain/value-objects/money.vo.js';
import { WalletId } from '../../../../../../shared/domain/value-objects/wallet-id.vo.js';
import { WalletOrmEntity } from '../entities/wallet.orm-entity.js';
import { MikroOrmWalletRepository } from './mikro-orm-wallet.repository.js';

function createEntityManagerMock() {
  return {
    findOne: vi.fn(),
    persist: vi.fn(),
    nativeUpdate: vi.fn(),
    flush: vi.fn(),
  };
}

describe('MikroOrmWalletRepository', () => {
  it('should find and rehydrate wallet by id', async () => {
    const entityManager = createEntityManagerMock();
    const entity = new WalletOrmEntity();

    entity.id = 'wallet-123';
    entity.playerId = 'player-123';
    entity.currency = 'BRL';
    entity.balance = '100.00';
    entity.version = 2;
    entity.createdAt = new Date('2026-09-01T12:00:00.000Z');
    entity.updatedAt = new Date('2026-09-02T12:00:00.000Z');

    entityManager.findOne.mockResolvedValue(entity);

    const repository = new MikroOrmWalletRepository(
      entityManager as unknown as EntityManager,
    );

    const wallet = await repository.findById(WalletId.from('wallet-123'));

    expect(entityManager.findOne).toHaveBeenCalledWith(WalletOrmEntity, {
      id: 'wallet-123',
    });

    expect(wallet).not.toBeNull();
    expect(wallet?.id.toString()).toBe('wallet-123');
    expect(wallet?.balance.toString()).toBe('100.00');
    expect(wallet?.version).toBe(2);
  });

  it('should return null when wallet does not exist', async () => {
    const entityManager = createEntityManagerMock();

    entityManager.findOne.mockResolvedValue(null);

    const repository = new MikroOrmWalletRepository(
      entityManager as unknown as EntityManager,
    );

    const wallet = await repository.findById(WalletId.from('wallet-123'));

    expect(wallet).toBeNull();
  });

  it('should register new wallet without flushing', async () => {
    const entityManager = createEntityManagerMock();
    const repository = new MikroOrmWalletRepository(
      entityManager as unknown as EntityManager,
    );

    const wallet = Wallet.open('player-123', 'BRL');

    await repository.add(wallet);

    expect(entityManager.persist).toHaveBeenCalledOnce();

    const persisted = entityManager.persist.mock.calls[0][0];

    expect(persisted).toBeInstanceOf(WalletOrmEntity);
    expect(persisted.balance).toBe('0.00');
    expect(persisted.version).toBe(1);
    expect(entityManager.flush).not.toHaveBeenCalled();
  });

  it('should update wallet when version matches', async () => {
    const entityManager = createEntityManagerMock();
    const repository = new MikroOrmWalletRepository(
      entityManager as unknown as EntityManager,
    );

    const wallet = Wallet.open('player-123', 'BRL');

    wallet.credit(
      'transaction-1',
      Money.from({
        amount: '100.00',
        currency: 'BRL',
      }),
    );

    entityManager.nativeUpdate.mockResolvedValue(1);

    const updated = await repository.update(wallet, 1);

    expect(updated).toBe(true);
    expect(entityManager.nativeUpdate).toHaveBeenCalledWith(
      WalletOrmEntity,
      {
        id: wallet.id.toString(),
        version: 1,
      },
      {
        balance: '100.00',
        version: 2,
        updatedAt: wallet.updatedAt,
      },
    );
  });

  it('should report conflict when version does not match', async () => {
    const entityManager = createEntityManagerMock();
    const repository = new MikroOrmWalletRepository(
      entityManager as unknown as EntityManager,
    );

    const wallet = Wallet.open('player-123', 'BRL');

    wallet.credit(
      'transaction-1',
      Money.from({
        amount: '100.00',
        currency: 'BRL',
      }),
    );

    entityManager.nativeUpdate.mockResolvedValue(0);

    const updated = await repository.update(wallet, 1);

    expect(updated).toBe(false);
  });
});
