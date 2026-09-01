import { randomUUID } from 'node:crypto';

import { Money } from '../../../shared/domain/value-objects/money.vo.js';
import { WalletId } from '../../../shared/domain/value-objects/wallet-id.vo.js';

export type WalletLedgerEntryType = 'credit' | 'debit';

type WalletLedgerEntryProps = {
  id: string;
  walletId: WalletId;
  type: WalletLedgerEntryType;
  amount: Money;
  createdAt: Date;
};

export class WalletLedgerEntry {
  private constructor(
    public readonly id: string,
    public readonly walletId: WalletId,
    public readonly type: WalletLedgerEntryType,
    public readonly amount: Money,
    public readonly createdAt: Date,
  ) {}

  static create(
    walletId: WalletId,
    type: WalletLedgerEntryType,
    amount: Money,
  ): WalletLedgerEntry {
    if (amount.isZero()) {
      throw new Error('Ledger entry amount must be greater than zero');
    }

    if (amount.isNegative()) {
      throw new Error('Ledger entry amount cannot be negative');
    }

    return new WalletLedgerEntry(
      randomUUID(),
      walletId,
      type,
      amount,
      new Date(),
    );
  }

  static rehydrate(props: WalletLedgerEntryProps): WalletLedgerEntry {
    return new WalletLedgerEntry(
      props.id,
      props.walletId,
      props.type,
      props.amount,
      props.createdAt,
    );
  }
}