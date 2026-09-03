import { describe, expect, it } from 'bun:test';
import { Money } from '../../../shared/domain/value-objects/money.vo.js';
import { Wallet } from './wallet.entity.js';
import { LedgerDirection } from '../../../modules/wallet/domain/enums/ledger-direction.enum.js';

describe('Wallet', () => {
  it('should open a wallet with zero balance', () => {
    const wallet = Wallet.open('player-123', 'BRL');

    expect(wallet.playerId).toBe('player-123');
    expect(wallet.currency).toBe('BRL');
    expect(wallet.balance.toString()).toBe('0.00');
    expect(wallet.version).toBe(1);
  });

  it('should credit wallet balance', () => {
    const wallet = Wallet.open('player-123', 'BRL');

    const entry = wallet.credit(
      'transaction-1',
      Money.from({
        amount: '100.00',
        currency: 'BRL',
      }),
    );

    expect(wallet.balance.toString()).toBe('100.00');
    expect(wallet.version).toBe(2);

    expect(entry.transactionId).toBe('transaction-1');
    expect(entry.direction).toBe(LedgerDirection.Credit);
    expect(entry.money.toString()).toBe('100.00');
    expect(entry.balanceBefore.toString()).toBe('0.00');
    expect(entry.balanceAfter.toString()).toBe('100.00');
  });

  it('should debit wallet balance', () => {
    const wallet = Wallet.open('player-123', 'BRL');

    wallet.credit(
      'transaction-1',
      Money.from({
        amount: '100.00',
        currency: 'BRL',
      }),
    );

    const entry = wallet.debit(
      'transaction-2',
      Money.from({
        amount: '25.00',
        currency: 'BRL',
      }),
    );

    expect(entry.transactionId).toBe('transaction-2');
    expect(entry.direction).toBe(LedgerDirection.Debit);
    expect(entry.balanceBefore.toString()).toBe('100.00');
    expect(entry.balanceAfter.toString()).toBe('75.00');
  });

  it('should not allow negative balance', () => {
    const wallet = Wallet.open('player-123', 'BRL');

    expect(() =>
      wallet.credit(
        'transaction-1',
        Money.from({
          amount: '10.00',
          currency: 'USD',
        }),
      ),
    ).toThrow('Currency mismatch');

    expect(wallet.balance.toString()).toBe('0.00');
    expect(wallet.version).toBe(1);
  });

  it('should reject different currency', () => {
    const wallet = Wallet.open('player-123', 'BRL');

    expect(() =>
      wallet.credit(
        'transaction-1',
        Money.from({
          amount: '10.00',
          currency: 'USD',
        }),
      ),
    ).toThrow('Currency mismatch');
  });

  it('should reject zero amount', () => {
    const wallet = Wallet.open('player-123', 'BRL');

    expect(() => wallet.credit('transaction-1', Money.zero('BRL'))).toThrow(
      'Amount must be greater than zero',
    );
  });

  it('should increment version only when balance changes', () => {
    const wallet = Wallet.open('player-123', 'BRL');

    expect(wallet.version).toBe(1);

    wallet.credit(
      'transaction-1',
      Money.from({
        amount: '20.00',
        currency: 'BRL',
      }),
    );

    expect(wallet.version).toBe(2);

    expect(() =>
      wallet.debit(
        'transaction-2',
        Money.from({
          amount: '101.00',
          currency: 'BRL',
        }),
      ),
    ).toThrow('Insufficient balance');

    expect(wallet.version).toBe(2);
  });
});
