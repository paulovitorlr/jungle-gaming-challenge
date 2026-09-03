import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { canonicalPayloadHash } from '../../../../shared/application/canonical-payload-hash.js';
import { NoopAuthGuard } from '../../../../shared/presentation/auth/noop-auth.guard.js';
import { ProcessWagerTransactionUseCase } from '../../application/use-cases/process-wager-transaction.use-case.js';
import { GetWagerTransactionUseCase } from '../../application/use-cases/get-wager-transaction.use-case.js';
import { WagerTransactionKind } from '../../domain/enums/wager-transaction-kind.enum.js';
import { MetricsService } from '../../../../shared/infrastructure/observability/metrics.service.js';

type WagerBody = {
  providerId: string;
  externalTransactionId: string;
  playerId: string;
  walletId: string;
  roundId: string;
  gameId: string;
  kind: WagerTransactionKind;
  money: { amount: string; currency: string };
  referenceExternalTransactionId?: string;
};

@Controller()
@UseGuards(NoopAuthGuard)
export class WageringController {
  constructor(
    private readonly processTransaction: ProcessWagerTransactionUseCase,
    private readonly getTransaction: GetWagerTransactionUseCase,
    private readonly metrics: MetricsService,
  ) {}

  @Post('wagering/transactions')
  async submit(
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key header is required');
    }
    const input = this.parseBody(body);
    if (input.kind === WagerTransactionKind.Opening) {
      throw new BadRequestException('OPENING cannot be submitted externally');
    }

    const startedAt = Date.now();
    const result = await this.processTransaction.execute({
      ...input,
      amount: input.money.amount,
      currency: input.money.currency,
      idempotencyKey,
      payloadHash: canonicalPayloadHash(input),
      correlationId: idempotencyKey,
    });

    this.metrics.increment('wager_transactions_total', {
      status: result.status,
    });
    if (result.idempotentReplay) {
      this.metrics.increment('wager_duplicates_total');
    }
    this.metrics.observeLatency(
      'wager_processing_latency_ms',
      Date.now() - startedAt,
    );

    response.status(
      result.idempotentReplay
        ? HttpStatus.OK
        : result.status === 'PENDING_REFERENCE'
          ? HttpStatus.ACCEPTED
          : result.status === 'REJECTED'
            ? HttpStatus.UNPROCESSABLE_ENTITY
            : HttpStatus.CREATED,
    );

    return {
      transactionId: result.transactionId,
      status: result.status,
      balance: { amount: result.balance, currency: result.currency },
      idempotentReplay: result.idempotentReplay,
      failureCode: result.failureCode,
    };
  }

  @Get('wagering/transactions/:transactionId')
  async byId(@Param('transactionId') transactionId: string) {
    const result = await this.getTransaction.byId(transactionId);
    if (!result) throw new NotFoundException('Transaction not found');
    return result;
  }

  @Get('providers/:providerId/wagering/transactions/:externalTransactionId')
  async byExternalId(
    @Param('providerId') providerId: string,
    @Param('externalTransactionId') externalTransactionId: string,
  ) {
    const result = await this.getTransaction.byProviderAndExternalId(
      providerId,
      externalTransactionId,
    );
    if (!result) throw new NotFoundException('Transaction not found');
    return result;
  }

  private parseBody(value: unknown): WagerBody {
    if (!this.isRecord(value) || !this.isRecord(value.money)) {
      throw new BadRequestException('Invalid transaction payload');
    }
    const required = [
      'providerId',
      'externalTransactionId',
      'playerId',
      'walletId',
      'roundId',
      'gameId',
      'kind',
    ] as const;
    for (const field of required) {
      if (
        typeof value[field] !== 'string' ||
        value[field].trim().length === 0
      ) {
        throw new BadRequestException(`${field} is required`);
      }
    }
    if (
      typeof value.money.amount !== 'string' ||
      typeof value.money.currency !== 'string' ||
      !Object.values(WagerTransactionKind).includes(
        value.kind as WagerTransactionKind,
      )
    ) {
      throw new BadRequestException('Invalid transaction payload');
    }

    return {
      providerId: value.providerId as string,
      externalTransactionId: value.externalTransactionId as string,
      playerId: value.playerId as string,
      walletId: value.walletId as string,
      roundId: value.roundId as string,
      gameId: value.gameId as string,
      kind: value.kind as WagerTransactionKind,
      money: {
        amount: value.money.amount,
        currency: value.money.currency,
      },
      referenceExternalTransactionId:
        typeof value.referenceExternalTransactionId === 'string'
          ? value.referenceExternalTransactionId
          : undefined,
    };
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }
}
