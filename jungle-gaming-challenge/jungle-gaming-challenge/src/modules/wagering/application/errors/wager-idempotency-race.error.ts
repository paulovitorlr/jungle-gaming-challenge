export class WagerIdempotencyRaceError extends Error {
  constructor() {
    super('A concurrent request already persisted this wager transaction');
    this.name = 'WagerIdempotencyRaceError';
  }
}
