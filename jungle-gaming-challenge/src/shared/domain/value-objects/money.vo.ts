import { Decimal } from 'decimal.js';

export type MoneyProps = {
  amount: string;
  currency: string;
};

export class Money {
  private constructor(
    private readonly amount: Decimal,
    public readonly currency: string,
  ) {}

  static from({ amount, currency }: MoneyProps): Money {
    if (!currency || currency.trim().length === 0) {
      throw new Error('Currency is required');
    }

    if (!/^-?\d+(\.\d{1,2})?$/.test(amount)) {
      throw new Error('Invalid monetary amount');
    }

    const decimal = new Decimal(amount);

    if (!decimal.isFinite()) {
      throw new Error('Amount must be finite');
    }

    return new Money(decimal, currency);
  }

  static zero(currency: string): Money {
    return Money.from({
      amount: '0.00',
      currency,
    });
  }

  add(other: Money): Money {
    this.ensureSameCurrency(other);

    return new Money(
      this.amount.plus(other.amount),
      this.currency,
    );
  }

  subtract(other: Money): Money {
    this.ensureSameCurrency(other);

    return new Money(
      this.amount.minus(other.amount),
      this.currency,
    );
  }

  negate(): Money {
    return new Money(this.amount.negated(), this.currency);
  }

  equals(other: Money): boolean {
    return (
      this.currency === other.currency &&
      this.amount.equals(other.amount)
    );
  }

  isNegative(): boolean {
    return this.amount.isNegative();
  }

  isPositive(): boolean {
  return this.amount.greaterThan(0);
  }

  isZero(): boolean {
    return this.amount.isZero();
  }

  toJSON(): MoneyProps {
    return {
      amount: this.toString(),
      currency: this.currency,
    };
  }

  toString(): string {
    return this.amount.toFixed(2);
  }

  private ensureSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new Error('Currency mismatch');
    }
  }
}