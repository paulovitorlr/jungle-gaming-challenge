export class IdempotencyConflictError extends Error {
  constructor() {
    super('The idempotency key has already been used with a different payload');

    this.name = 'IdempotencyConflictError';
  }
}
