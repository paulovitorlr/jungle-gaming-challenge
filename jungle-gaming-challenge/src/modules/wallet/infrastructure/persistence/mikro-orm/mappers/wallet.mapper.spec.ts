import { Wallet } from '../../../../../../shared/domain/entities/wallet.entity.js';
import { WalletOrmEntity } from '../entities/wallet.orm-entity.js';
import { WalletMapper } from './wallet.mapper.js';

describe('WalletMapper', () => {
  it('should map domain wallet to persistence entity', () => {
    const wallet = Wallet.open('player-123', 'BRL');

    const entity = WalletMapper.toPersistence(wallet);

    expect(entity).toBeInstanceOf(WalletOrmEntity);
    expect(entity.id).toBe(wallet.id.toString());
    expect(entity.playerId).toBe('player-123');
    expect(entity.currency).toBe('BRL');
    expect(entity.balance).toBe('0.00');
    expect(entity.version).toBe(1);
    expect(entity.createdAt).toEqual(wallet.createdAt);
    expect(entity.updatedAt).toEqual(wallet.updatedAt);
  });

  it('should map persistence entity to domain wallet', () => {
    const entity = new WalletOrmEntity();

    entity.id = 'wallet-123';
    entity.playerId = 'player-123';
    entity.currency = 'BRL';
    entity.balance = '150.00';
    entity.version = 3;
    entity.createdAt =
      new Date('2026-09-01T12:00:00.000Z');
    entity.updatedAt =
      new Date('2026-09-02T12:00:00.000Z');

    const wallet = WalletMapper.toDomain(entity);

    expect(wallet.id.toString()).toBe('wallet-123');
    expect(wallet.playerId).toBe('player-123');
    expect(wallet.currency).toBe('BRL');
    expect(wallet.balance.toString()).toBe('150.00');
    expect(wallet.version).toBe(3);
    expect(wallet.createdAt).toEqual(entity.createdAt);
    expect(wallet.updatedAt).toEqual(entity.updatedAt);
  });
});