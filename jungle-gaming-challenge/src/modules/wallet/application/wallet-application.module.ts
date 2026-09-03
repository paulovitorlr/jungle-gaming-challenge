import { Module } from '@nestjs/common';
import {
  WALLET_REPOSITORY,
  type WalletRepository,
} from '../domain/repositories/wallet.repository.js';
import {
  WALLET_LEDGER_REPOSITORY,
  type WalletLedgerRepository,
} from '../domain/repositories/wallet-ledger.repository.js';
import { WalletPersistenceModule } from '../infrastructure/persistence/wallet-persistence.module.js';
import { WageringPersistenceModule } from '../../wagering/infrastructure/persistence/wagering-persistence.module.js';
import { WagerTransactionRepository } from '../../wagering/domain/repositories/wager-transaction.repository.js';
import { MessagingPersistenceModule } from '../../messaging/infrastructure/persistence/messaging-persistence.module.js';
import { OutboxMessageRepository } from '../../messaging/domain/repositories/outbox-message.repository.js';
import {
  UNIT_OF_WORK,
  type UnitOfWork,
} from '../../../shared/application/ports/unit-of-work.js';
import { DatabaseTransactionModule } from '../../../shared/infrastructure/database/database-transaction.module.js';
import { OpenWalletUseCase } from './use-cases/open-wallet.use-case.js';
import { GetWalletUseCase } from './use-cases/get-wallet.use-case.js';
import { GetWalletLedgerUseCase } from './use-cases/get-wallet-ledger.use-case.js';
import { ReconcileWalletUseCase } from './use-cases/reconcile-wallet.use-case.js';
import { MetricsService } from '../../../shared/infrastructure/observability/metrics.service.js';

@Module({
  imports: [
    WalletPersistenceModule,
    WageringPersistenceModule,
    MessagingPersistenceModule,
    DatabaseTransactionModule,
  ],
  providers: [
    {
      provide: OpenWalletUseCase,
      useFactory: (
        wallets: WalletRepository,
        ledger: WalletLedgerRepository,
        transactions: WagerTransactionRepository,
        outbox: OutboxMessageRepository,
        unitOfWork: UnitOfWork,
      ) =>
        new OpenWalletUseCase(
          wallets,
          ledger,
          transactions,
          outbox,
          unitOfWork,
        ),
      inject: [
        WALLET_REPOSITORY,
        WALLET_LEDGER_REPOSITORY,
        WagerTransactionRepository,
        OutboxMessageRepository,
        UNIT_OF_WORK,
      ],
    },
    {
      provide: GetWalletUseCase,
      useFactory: (wallets: WalletRepository) => new GetWalletUseCase(wallets),
      inject: [WALLET_REPOSITORY],
    },
    {
      provide: GetWalletLedgerUseCase,
      useFactory: (ledger: WalletLedgerRepository) =>
        new GetWalletLedgerUseCase(ledger),
      inject: [WALLET_LEDGER_REPOSITORY],
    },
    {
      provide: ReconcileWalletUseCase,
      useFactory: (
        wallets: WalletRepository,
        ledger: WalletLedgerRepository,
        unitOfWork: UnitOfWork,
        metrics: MetricsService,
      ) => new ReconcileWalletUseCase(wallets, ledger, unitOfWork, metrics),
      inject: [
        WALLET_REPOSITORY,
        WALLET_LEDGER_REPOSITORY,
        UNIT_OF_WORK,
        MetricsService,
      ],
    },
  ],
  exports: [
    OpenWalletUseCase,
    GetWalletUseCase,
    GetWalletLedgerUseCase,
    ReconcileWalletUseCase,
  ],
})
export class WalletApplicationModule {}
