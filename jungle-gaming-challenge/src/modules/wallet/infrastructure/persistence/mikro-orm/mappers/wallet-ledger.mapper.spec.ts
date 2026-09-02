import { Money } from '../../../../../../shared/domain/value-objects/money.vo.js';
import { WalletId } from '../../../../../../shared/domain/value-objects/wallet-id.vo.js';
import { LedgerDirection } from '../../../../domain/enums/ledger-direction.enum.js';
import { WalletLedgerEntry } from '../../../../domain/entities/wallet-ledger-entry.js';
import { WalletLedgerOrmEntity } from '../entities/wallet-ledger.orm-entity.js';
import { WalletLedgerMapper } from './wallet-ledger.mapper.js';

describe('WalletLedgerMapper', () => {
  it('should map domain entry to persistence entity', () => {
    const createdAt = new Date('2026-09-02T12:00:00.000Z');

    const entry = WalletLedgerEntry.create({
      id: 'ledger-entry-1',
      walletId: WalletId.from('wallet-123'),
      transactionId: 'transaction-1',
      direction: LedgerDirection.Credit,
      money: Money.from({
        amount: '100.00',
        currency: 'BRL',
      }),
      balanceBefore: Money.from({
        amount: '0.00',
        currency: 'BRL',
      }),
      balanceAfter: Money.from({
        amount: '100.00',
        currency: 'BRL',
      }),
      createdAt,
    });

    const entity = WalletLedgerMapper.toPersistence(entry);

    expect(entity).toBeInstanceOf(WalletLedgerOrmEntity);
    expect(entity.id).toBe('ledger-entry-1');
    expect(entity.walletId).toBe('wallet-123');
    expect(entity.transactionId).toBe('transaction-1');
    expect(entity.direction).toBe(LedgerDirection.Credit);
    expect(entity.amount).toBe('100.00');
    expect(entity.currency).toBe('BRL');
    expect(entity.balanceBefore).toBe('0.00');
    expect(entity.balanceAfter).toBe('100.00');
    expect(entity.createdAt).toEqual(createdAt);
  });

  it('should map persistence entity to domain entry', () => {
    const entity = new WalletLedgerOrmEntity();

    entity.id = 'ledger-entry-2';
    entity.walletId = 'wallet-123';
    entity.transactionId = 'transaction-2';
    entity.direction = LedgerDirection.Debit;
    entity.amount = '30.00';
    entity.currency = 'BRL';
    entity.balanceBefore = '100.00';
    entity.balanceAfter = '70.00';
    entity.createdAt = new Date('2026-09-02T13:00:00.000Z');

    const entry = WalletLedgerMapper.toDomain(entity);

    expect(entry.id).toBe('ledger-entry-2');
    expect(entry.walletId.toString()).toBe('wallet-123');
    expect(entry.transactionId).toBe('transaction-2');
    expect(entry.direction).toBe(LedgerDirection.Debit);
    expect(entry.money.toString()).toBe('30.00');
    expect(entry.money.currency).toBe('BRL');
    expect(entry.balanceBefore.toString()).toBe('100.00');
    expect(entry.balanceAfter.toString()).toBe('70.00');
    expect(entry.createdAt).toEqual(entity.createdAt);
    expect(entry.isBalanced()).toBe(true);
  });
});