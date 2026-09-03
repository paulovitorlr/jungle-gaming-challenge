import {
  ArgumentsHost,
  Catch,
  ConflictException,
  ExceptionFilter,
  HttpException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Response } from 'express';
import { UniqueConstraintViolationError } from '../../application/errors/unique-constraint-violation.error.js';
import { IdempotencyConflictError } from '../../../modules/wagering/application/errors/idempotency-conflict.error.js';
import { InvalidWagerReferenceError } from '../../../modules/wagering/domain/errors/invalid-wager-reference.error.js';
import { InvalidWagerTransactionError } from '../../../modules/wagering/domain/errors/invalid-wager-transaction.error.js';
import { WalletAlreadyExistsError } from '../../../modules/wallet/application/errors/wallet-already-exists.error.js';
import { WalletConcurrencyConflictError } from '../../../modules/wallet/domain/errors/wallet-concurrency-conflict.error.js';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const exception = this.map(error);
    const body = exception.getResponse();
    response.status(exception.getStatus()).json(body);
  }

  private map(error: unknown): HttpException {
    if (error instanceof HttpException) return error;
    if (
      error instanceof IdempotencyConflictError ||
      error instanceof WalletAlreadyExistsError ||
      error instanceof UniqueConstraintViolationError
    ) {
      return new ConflictException({
        code: 'CONFLICT',
        message: error.message,
      });
    }
    if (
      error instanceof InvalidWagerReferenceError ||
      error instanceof InvalidWagerTransactionError
    ) {
      return new UnprocessableEntityException({
        code:
          error instanceof InvalidWagerReferenceError
            ? error.code
            : 'INVALID_TRANSACTION',
        message: error.message,
      });
    }
    if (error instanceof WalletConcurrencyConflictError) {
      return new ServiceUnavailableException({
        code: 'TRANSIENT_CONCURRENCY_CONFLICT',
        message: error.message,
      });
    }
    return new UnprocessableEntityException({
      code: 'INVALID_REQUEST',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
