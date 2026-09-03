export class InboxPayloadConflictError extends Error {
  constructor() {
    super('The message id was already received with a different payload');

    this.name = 'InboxPayloadConflictError';
  }
}
