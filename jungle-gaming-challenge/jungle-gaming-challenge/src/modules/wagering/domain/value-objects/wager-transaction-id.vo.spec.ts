import { describe, expect, it } from 'bun:test';

import { WagerTransactionId } from './wager-transaction-id.vo.js';

describe('WagerTransactionId', () => {
  it('should create a new identifier', () => {
    const id = WagerTransactionId.create();

    expect(id.value).toBeDefined();
    expect(id.value.length).toBeGreaterThan(0);
  });

  it('should reconstruct an identifier from an existing value', () => {
    const id = WagerTransactionId.from('transaction-id');

    expect(id.value).toBe('transaction-id');
  });

  it('should reject an empty identifier', () => {
    expect(() => WagerTransactionId.from('')).toThrow(
      'Wager transaction id is required',
    );
  });

  it('should reject an identifier containing only whitespace', () => {
    expect(() => WagerTransactionId.from('   ')).toThrow(
      'Wager transaction id is required',
    );
  });

  it('should compare identifiers by value', () => {
    const first = WagerTransactionId.from('transaction-id');
    const second = WagerTransactionId.from('transaction-id');

    expect(first.equals(second)).toBe(true);
  });

  it('should identify different identifiers', () => {
    const first = WagerTransactionId.from('first-transaction');
    const second = WagerTransactionId.from('second-transaction');

    expect(first.equals(second)).toBe(false);
  });

  it('should return its value as a string', () => {
    const id = WagerTransactionId.from('transaction-id');

    expect(id.toString()).toBe('transaction-id');
  });
});
