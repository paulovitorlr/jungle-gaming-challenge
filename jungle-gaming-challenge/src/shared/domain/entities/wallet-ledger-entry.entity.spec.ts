import { Money } from '../../../shared/domain/value-objects/money.vo.js';
import { WalletId } from '../../../shared/domain/value-objects/wallet-id.vo.js';
import { WalletLedgerEntry } from './wallet-ledger-entry.entity.js';

describe('WalletLedgerEntry', () => {
  it('should create a credit ledger entry', () => {
    const walletId = WalletId.create();
    const amount = Money.from({
      amount: '100.00',
      currency: 'BRL',
    });

    const entry = WalletLedgerEntry.create(
      walletId,
      'credit',
      amount,
    );

    expect(entry.id).toBeDefined();
    expect(entry.walletId.equals(walletId)).toBe(true);
    expect(entry.type).toBe('credit');
    expect(entry.amount.equals(amount)).toBe(true);
    expect(entry.createdAt).toBeInstanceOf(Date);
  });

  it('should create a debit ledger entry', () => {
    const entry = WalletLedgerEntry.create(
      WalletId.create(),
      'debit',
      Money.from({
        amount: '25.00',
        currency: 'BRL',
      }),
    );

    expect(entry.type).toBe('debit');
    expect(entry.amount.toString()).toBe('25.00');
  });

  it('should reject zero amount', () => {
    expect(() =>
      WalletLedgerEntry.create(
        WalletId.create(),
        'credit',
        Money.zero('BRL'),
      ),
    ).toThrow('Ledger entry amount must be greater than zero');
  });

  it('should reject negative amount', () => {
    expect(() =>
      WalletLedgerEntry.create(
        WalletId.create(),
        'debit',
        Money.from({
          amount: '-10.00',
          currency: 'BRL',
        }),
      ),
    ).toThrow('Ledger entry amount cannot be negative');
  });
});