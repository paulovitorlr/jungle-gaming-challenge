export class InsufficientWalletBalanceError extends Error {
  constructor() {
    super('Insufficient balance');
    this.name = 'InsufficientWalletBalanceError';
  }
}
