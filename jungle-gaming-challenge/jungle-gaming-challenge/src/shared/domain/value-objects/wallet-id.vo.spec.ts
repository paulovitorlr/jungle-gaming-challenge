import { describe, expect, it } from 'bun:test';
import { WalletId } from './wallet-id.vo.js';

describe('WalletId', () => {
  it('should create a new wallet id', () => {
    const walletId = WalletId.create();

    expect(walletId.toString()).toBeDefined();
    expect(walletId.toString().length).toBeGreaterThan(0);
  });

  it('should create wallet id from existing value', () => {
    const walletId = WalletId.from('wallet-123');

    expect(walletId.toString()).toBe('wallet-123');
  });

  it('should compare wallet ids', () => {
    const first = WalletId.from('wallet-123');
    const second = WalletId.from('wallet-123');

    expect(first.equals(second)).toBe(true);
  });

  it('should reject empty wallet id', () => {
    expect(() => WalletId.from('')).toThrow('Wallet id is required');
  });
});
