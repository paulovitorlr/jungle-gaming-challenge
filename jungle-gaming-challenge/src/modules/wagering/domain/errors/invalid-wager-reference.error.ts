import { WagerFailureCode } from '../enums/wager-failure-code.enum.js';

export class InvalidWagerReferenceError extends Error {
  constructor(
    public readonly code: WagerFailureCode,
    message: string,
  ) {
    super(message);
    this.name = 'InvalidWagerReferenceError';
  }
}