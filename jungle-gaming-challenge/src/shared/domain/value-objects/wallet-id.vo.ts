import { randomUUID } from 'node:crypto';

export class WalletId {
  private constructor(private readonly value: string) {}

  static create(): WalletId {
    return new WalletId(randomUUID());
  }

  static from(value: string): WalletId {
    if (!value || value.trim().length === 0) {
      throw new Error('Wallet id is required');
    }

    return new WalletId(value);
  }

  equals(other: WalletId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
