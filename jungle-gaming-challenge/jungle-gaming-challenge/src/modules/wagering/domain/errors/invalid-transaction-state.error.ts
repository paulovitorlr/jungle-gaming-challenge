export class InvalidTransactionStateError extends Error {
  constructor(currentStatus: string) {
    super(
      `Wager transaction cannot transition from terminal status ${currentStatus}`,
    );

    this.name = 'InvalidTransactionStateError';
  }
}
