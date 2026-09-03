import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OpenWalletUseCase } from '../../application/use-cases/open-wallet.use-case.js';
import { GetWalletUseCase } from '../../application/use-cases/get-wallet.use-case.js';
import { GetWalletLedgerUseCase } from '../../application/use-cases/get-wallet-ledger.use-case.js';
import { ReconcileWalletUseCase } from '../../application/use-cases/reconcile-wallet.use-case.js';
import { NoopAuthGuard } from '../../../../shared/presentation/auth/noop-auth.guard.js';

@Controller('wallets')
@UseGuards(NoopAuthGuard)
export class WalletController {
  constructor(
    private readonly openWallet: OpenWalletUseCase,
    private readonly getWallet: GetWalletUseCase,
    private readonly getLedger: GetWalletLedgerUseCase,
    private readonly reconcileWallet: ReconcileWalletUseCase,
  ) {}

  @Post()
  create(@Body() body: unknown) {
    if (!this.isRecord(body) || typeof body.playerId !== 'string') {
      throw new BadRequestException('playerId is required');
    }
    if (
      !this.isRecord(body.initialBalance) ||
      typeof body.initialBalance.amount !== 'string' ||
      typeof body.initialBalance.currency !== 'string'
    ) {
      throw new BadRequestException('initialBalance is invalid');
    }

    return this.openWallet.execute({
      playerId: body.playerId,
      initialBalance: {
        amount: body.initialBalance.amount,
        currency: body.initialBalance.currency,
      },
    });
  }

  @Get(':walletId')
  async find(@Param('walletId') walletId: string) {
    const wallet = await this.getWallet.execute(walletId);
    if (!wallet) throw new NotFoundException('Wallet not found');
    return wallet;
  }

  @Get(':walletId/ledger')
  ledger(
    @Param('walletId') walletId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.getLedger.execute({
      walletId,
      cursor,
      limit: limit === undefined ? undefined : Number(limit),
    });
  }

  @Post(':walletId/reconciliation')
  @HttpCode(HttpStatus.OK)
  async reconcile(@Param('walletId') walletId: string) {
    const result = await this.reconcileWallet.execute(walletId);
    if (!result) throw new NotFoundException('Wallet not found');
    return result;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }
}
