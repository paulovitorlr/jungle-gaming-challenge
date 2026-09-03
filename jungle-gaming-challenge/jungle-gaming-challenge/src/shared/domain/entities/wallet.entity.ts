import { Money } from '../../../shared/domain/value-objects/money.vo.js';
import { WalletId } from '../../../shared/domain/value-objects/wallet-id.vo.js';
import { LedgerDirection } from '../../../modules/wallet/domain/enums/ledger-direction.enum.js';
import { WalletLedgerEntry } from '../../../modules/wallet/domain/entities/wallet-ledger-entry.js';
import { InsufficientWalletBalanceError } from '../../../modules/wallet/domain/errors/insufficient-wallet-balance.error.js';

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

  static openWithInitialBalance(
    playerId: string,
    initialBalance: Money,
    openingTransactionId: string,
  ): { wallet: Wallet; entry?: WalletLedgerEntry } {
    if (!playerId || playerId.trim().length === 0) {
      throw new Error('Player id is required');
    }

    if (initialBalance.isNegative()) {
      throw new Error('Initial balance cannot be negative');
    }

    const now = new Date();
    const id = WalletId.create();
    const wallet = new Wallet(
      id,
      playerId,
      initialBalance.currency,
      initialBalance,
      1,
      now,
      now,
    );

    if (initialBalance.isZero()) return { wallet };

    return {
      wallet,
      entry: WalletLedgerEntry.create({
        id: crypto.randomUUID(),
        walletId: id,
        transactionId: openingTransactionId,
        direction: LedgerDirection.Credit,
        money: initialBalance,
        balanceBefore: Money.zero(initialBalance.currency),
        balanceAfter: initialBalance,
        createdAt: now,
      }),
    };
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

  credit(transactionId: string, amount: Money): WalletLedgerEntry {
    this.ensureSameCurrency(amount);
    this.ensurePositiveAmount(amount);

    const balanceBefore = this._balance;
    const balanceAfter = balanceBefore.add(amount);

    this._balance = balanceAfter;
    this.touch();

    return WalletLedgerEntry.create({
      id: crypto.randomUUID(),
      walletId: this.id,
      transactionId,
      direction: LedgerDirection.Credit,
      money: amount,
      balanceBefore,
      balanceAfter,
    });
  }

  debit(transactionId: string, amount: Money): WalletLedgerEntry {
    this.ensureSameCurrency(amount);
    this.ensurePositiveAmount(amount);

    const balanceBefore = this._balance;
    const balanceAfter = balanceBefore.subtract(amount);

    if (balanceAfter.isNegative()) {
      throw new InsufficientWalletBalanceError();
    }

    this._balance = balanceAfter;
    this.touch();

    return WalletLedgerEntry.create({
      id: crypto.randomUUID(),
      walletId: this.id,
      transactionId,
      direction: LedgerDirection.Debit,
      money: amount,
      balanceBefore,
      balanceAfter,
    });
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
