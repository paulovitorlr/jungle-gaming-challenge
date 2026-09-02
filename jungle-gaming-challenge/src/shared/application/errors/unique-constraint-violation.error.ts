export class UniqueConstraintViolationError extends Error {
  constructor(
    public readonly constraint?: string,
  ) {
    super('A unique constraint was violated');
    this.name = 'UniqueConstraintViolationError';
  }
}