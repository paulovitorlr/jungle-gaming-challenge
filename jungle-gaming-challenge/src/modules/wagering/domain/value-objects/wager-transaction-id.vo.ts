import { randomUUID } from 'node:crypto';

export class WagerTransactionId {
  private constructor(public readonly value: string) {}

  static create(): WagerTransactionId {
    return new WagerTransactionId(randomUUID());
  }

  static from(value: string): WagerTransactionId {
    if (!value || value.trim().length === 0) {
      throw new Error('Wager transaction id is required');
    }

    return new WagerTransactionId(value);
  }

  equals(other: WagerTransactionId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}