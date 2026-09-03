export class WalletAlreadyExistsError extends Error {
  constructor() {
    super('A wallet already exists for this player and currency');
    this.name = 'WalletAlreadyExistsError';
  }
}
