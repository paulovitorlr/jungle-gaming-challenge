import { Money } from '../../../shared/domain/value-objects/money.vo.js';
import { Wallet } from './wallet.entity.js';

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
      Money.from({
        amount: '100.00',
        currency: 'BRL',
      }),
    );

    expect(wallet.balance.toString()).toBe('100.00');
    expect(wallet.version).toBe(2);

    expect(entry.type).toBe('credit');
    expect(entry.amount.toString()).toBe('100.00');
  });

  it('should debit wallet balance', () => {
    const wallet = Wallet.open('player-123', 'BRL');

    wallet.credit(
      Money.from({
        amount: '100.00',
        currency: 'BRL',
      }),
    );

    const entry = wallet.debit(
      Money.from({
        amount: '40.00',
        currency: 'BRL',
      }),
    );

    expect(wallet.balance.toString()).toBe('60.00');
    expect(wallet.version).toBe(3);

    expect(entry.type).toBe('debit');
    expect(entry.amount.toString()).toBe('40.00');
  });

  it('should not allow negative balance', () => {
    const wallet = Wallet.open('player-123', 'BRL');

    expect(() =>
      wallet.debit(
        Money.from({
          amount: '10.00',
          currency: 'BRL',
        }),
      ),
    ).toThrow('Insufficient balance');

    expect(wallet.balance.toString()).toBe('0.00');
    expect(wallet.version).toBe(1);
  });

  it('should reject different currency', () => {
    const wallet = Wallet.open('player-123', 'BRL');

    expect(() =>
      wallet.credit(
        Money.from({
          amount: '10.00',
          currency: 'USD',
        }),
      ),
    ).toThrow('Currency mismatch');
  });

  it('should reject zero amount', () => {
    const wallet = Wallet.open('player-123', 'BRL');

    expect(() =>
      wallet.credit(Money.zero('BRL')),
    ).toThrow('Amount must be greater than zero');
  });

  it('should increment version only when balance changes', () => {
    const wallet = Wallet.open('player-123', 'BRL');

    expect(wallet.version).toBe(1);

    wallet.credit(
      Money.from({
        amount: '20.00',
        currency: 'BRL',
      }),
    );

    expect(wallet.version).toBe(2);

    expect(() =>
      wallet.debit(
        Money.from({
          amount: '30.00',
          currency: 'BRL',
        }),
      ),
    ).toThrow();

    expect(wallet.version).toBe(2);
  });
});