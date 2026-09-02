export class WalletConcurrencyConflictError extends Error {
  constructor() {
    super('Wallet concurrent modification detected');

    this.name = 'WalletConcurrencyConflictError';
  }
}