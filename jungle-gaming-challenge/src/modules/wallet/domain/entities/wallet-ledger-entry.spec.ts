import { describe, expect, it } from 'vitest';

import { Money } from '../../../../shared/domain/value-objects/money.vo.js';
import { WalletId } from '../../../../shared/domain/value-objects/wallet-id.vo.js';
import { LedgerDirection } from '../enums/ledger-direction.enum.js';
import { WalletLedgerEntry } from './wallet-ledger-entry.js';

describe('WalletLedgerEntry', () => {
  const walletId = WalletId.create();

  it('creates a balanced debit entry', () => {
    const entry = WalletLedgerEntry.create({
      id: 'ledger-entry-1',
      walletId,
      transactionId: 'transaction-1',
      direction: LedgerDirection.Debit,
      money: Money.from({
        amount: '25.00',
        currency: 'BRL',
      }),
      balanceBefore: Money.from({
        amount: '100.00',
        currency: 'BRL',
      }),
      balanceAfter: Money.from({
        amount: '75.00',
        currency: 'BRL',
      }),
    });

    expect(entry.isBalanced()).toBe(true);
    expect(entry.direction).toBe(LedgerDirection.Debit);
  });

  it('creates a balanced credit entry', () => {
    const entry = WalletLedgerEntry.create({
      id: 'ledger-entry-2',
      walletId,
      transactionId: 'transaction-2',
      direction: LedgerDirection.Credit,
      money: Money.from({
        amount: '25.00',
        currency: 'BRL',
      }),
      balanceBefore: Money.from({
        amount: '100.00',
        currency: 'BRL',
      }),
      balanceAfter: Money.from({
        amount: '125.00',
        currency: 'BRL',
      }),
    });

    expect(entry.isBalanced()).toBe(true);
    expect(entry.direction).toBe(LedgerDirection.Credit);
  });

  it('rejects an unbalanced debit entry', () => {
    expect(() =>
      WalletLedgerEntry.create({
        id: 'ledger-entry-3',
        walletId,
        transactionId: 'transaction-3',
        direction: LedgerDirection.Debit,
        money: Money.from({
          amount: '25.00',
          currency: 'BRL',
        }),
        balanceBefore: Money.from({
          amount: '100.00',
          currency: 'BRL',
        }),
        balanceAfter: Money.from({
          amount: '80.00',
          currency: 'BRL',
        }),
      }),
    ).toThrow('Wallet ledger entry is not balanced');
  });

  it('rehydrates a persisted ledger entry without revalidating it', () => {
    const createdAt = new Date('2026-09-01T12:00:00.000Z');

    const entry = WalletLedgerEntry.rehydrate({
      id: 'ledger-entry-4',
      walletId,
      transactionId: 'transaction-4',
      direction: LedgerDirection.Credit,
      money: Money.from({
        amount: '50.00',
        currency: 'BRL',
      }),
      balanceBefore: Money.from({
        amount: '100.00',
        currency: 'BRL',
      }),
      balanceAfter: Money.from({
        amount: '150.00',
        currency: 'BRL',
      }),
      createdAt,
    });

    expect(entry.id).toBe('ledger-entry-4');
    expect(entry.createdAt).toEqual(createdAt);
    expect(entry.isBalanced()).toBe(true);
  });
});