import { Logger } from '@nestjs/common';
import { Money } from '../../../../shared/domain/value-objects/money.vo.js';
import { WalletId } from '../../../../shared/domain/value-objects/wallet-id.vo.js';
import { LedgerDirection } from '../../domain/enums/ledger-direction.enum.js';
import type { WalletLedgerRepository } from '../../domain/repositories/wallet-ledger.repository.js';
import type { WalletRepository } from '../../domain/repositories/wallet.repository.js';
import type { MetricsService } from '../../../../shared/infrastructure/observability/metrics.service.js';
import type { UnitOfWork } from '../../../../shared/application/ports/unit-of-work.js';

export class ReconcileWalletUseCase {
  private readonly logger = new Logger(ReconcileWalletUseCase.name);

  constructor(
    private readonly wallets: WalletRepository,
    private readonly ledger: WalletLedgerRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly metrics?: MetricsService,
  ) {}

  async execute(walletIdValue: string) {
    return this.unitOfWork.execute(async () => {
      const walletId = WalletId.from(walletIdValue);
      const wallet = await this.wallets.findById(walletId);
      if (!wallet) return null;

      const entries = await this.ledger.findByWalletId(walletId);
      let calculated = Money.zero(wallet.currency);
      for (const entry of entries) {
        calculated =
          entry.direction === LedgerDirection.Credit
            ? calculated.add(entry.money)
            : calculated.subtract(entry.money);
      }

      const difference = wallet.balance.subtract(calculated);
      const consistent = difference.isZero();
      if (!consistent) {
        this.metrics?.increment('wallet_reconciliation_divergences_total');
        this.logger.error(
          JSON.stringify({
            event: 'wallet_reconciliation_divergence',
            walletId: wallet.id.toString(),
            checkedEntries: entries.length,
          }),
        );
      }

      return {
        walletId: wallet.id.toString(),
        storedBalance: wallet.balance.toJSON(),
        calculatedBalance: calculated.toJSON(),
        difference: difference.toJSON(),
        consistent,
        checkedEntries: entries.length,
      };
    });
  }
}
