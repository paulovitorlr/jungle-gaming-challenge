import { Money } from './money.vo.js';

describe('Money', () => {
  it('should create money from a valid decimal string', () => {
    const money = Money.from({
      amount: '25.00',
      currency: 'BRL',
    });

    expect(money.toString()).toBe('25.00');
    expect(money.currency).toBe('BRL');
  });

  it('should create zero money', () => {
    const money = Money.zero('BRL');

    expect(money.toString()).toBe('0.00');
  });

  it('should add money with the same currency', () => {
    const first = Money.from({
      amount: '10.00',
      currency: 'BRL',
    });

    const second = Money.from({
      amount: '5.50',
      currency: 'BRL',
    });

    const result = first.add(second);

    expect(result.toString()).toBe('15.50');
  });

  it('should subtract money', () => {
    const first = Money.from({
      amount: '10.00',
      currency: 'BRL',
    });

    const second = Money.from({
      amount: '4.50',
      currency: 'BRL',
    });

    expect(first.subtract(second).toString()).toBe('5.50');
  });

  it('should negate money', () => {
    const money = Money.from({
      amount: '10.00',
      currency: 'BRL',
    });

    expect(money.negate().toString()).toBe('-10.00');
  });

  it('should reject scientific notation', () => {
    expect(() =>
      Money.from({
        amount: '1e3',
        currency: 'BRL',
      }),
    ).toThrow();
  });

  it('should reject more than two decimal places', () => {
    expect(() =>
      Money.from({
        amount: '10.123',
        currency: 'BRL',
      }),
    ).toThrow();
  });

  it('should reject different currencies when adding', () => {
    const brl = Money.from({
      amount: '10.00',
      currency: 'BRL',
    });

    const usd = Money.from({
      amount: '10.00',
      currency: 'USD',
    });

    expect(() => brl.add(usd)).toThrow('Currency mismatch');
  });

  it('should identify a positive amount', () => {
    const money = Money.from({
      amount: '10.00',
      currency: 'BRL',
    });

    expect(money.isPositive()).toBe(true);
  });

  it('should not identify zero as positive', () => {
    const money = Money.zero('BRL');

    expect(money.isPositive()).toBe(false);
  });

  it('should not identify a negative amount as positive', () => {
    const money = Money.from({
      amount: '-10.00',
      currency: 'BRL',
    });

    expect(money.isPositive()).toBe(false);
  });

  it('should serialize money as decimal string', () => {
    const money = Money.from({
      amount: '25',
      currency: 'BRL',
    });

    expect(money.toJSON()).toEqual({
      amount: '25.00',
      currency: 'BRL',
    });
  });
});