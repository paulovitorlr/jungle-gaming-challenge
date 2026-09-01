import { Money } from '../../../shared/domain/value-objects/money.vo.js';
import { WalletId } from '../../../shared/domain/value-objects/wallet-id.vo.js';
import { WalletLedgerEntry } from './wallet-ledger-entry.entity.js';

type WalletProps = {
  id: WalletId;
  playerId: string;
  currency: string;
  balance: Money;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

export class Wallet {
  private constructor(
    public readonly id: WalletId,
    public readonly playerId: string,
    public readonly currency: string,
    private _balance: Money,
    private _version: number,
    public readonly createdAt: Date,
    private _updatedAt: Date,
  ) {}

  static open(playerId: string, currency: string): Wallet {
    if (!playerId || playerId.trim().length === 0) {
      throw new Error('Player id is required');
    }

    if (!currency || currency.trim().length === 0) {
      throw new Error('Currency is required');
    }

    const now = new Date();

    return new Wallet(
      WalletId.create(),
      playerId,
      currency,
      Money.zero(currency),
      1,
      now,
      now,
    );
  }

  static rehydrate(props: WalletProps): Wallet {
    return new Wallet(
      props.id,
      props.playerId,
      props.currency,
      props.balance,
      props.version,
      props.createdAt,
      props.updatedAt,
    );
  }

  credit(amount: Money): WalletLedgerEntry {
    this.ensureSameCurrency(amount);
    this.ensurePositiveAmount(amount);

    this._balance = this._balance.add(amount);
    this.touch();

    return WalletLedgerEntry.create(
      this.id,
      'credit',
      amount,
    );
  }

  debit(amount: Money): WalletLedgerEntry {
    this.ensureSameCurrency(amount);
    this.ensurePositiveAmount(amount);

    const newBalance = this._balance.subtract(amount);

    if (newBalance.isNegative()) {
      throw new Error('Insufficient balance');
    }

    this._balance = newBalance;
    this.touch();

    return WalletLedgerEntry.create(
      this.id,
      'debit',
      amount,
    );
  }

  get balance(): Money {
    return this._balance;
  }

  get version(): number {
    return this._version;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  private ensureSameCurrency(amount: Money): void {
    if (amount.currency !== this.currency) {
      throw new Error('Currency mismatch');
    }
  }

  private ensurePositiveAmount(amount: Money): void {
    if (amount.isZero() || amount.isNegative()) {
      throw new Error('Amount must be greater than zero');
    }
  }

  private touch(): void {
    this._version += 1;
    this._updatedAt = new Date();
  }
}