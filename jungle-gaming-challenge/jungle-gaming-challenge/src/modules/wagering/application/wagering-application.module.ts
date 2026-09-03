import { Module } from '@nestjs/common';

import {
  WALLET_REPOSITORY,
  type WalletRepository,
} from '../../wallet/domain/repositories/wallet.repository.js';

import {
  WALLET_LEDGER_REPOSITORY,
  type WalletLedgerRepository,
} from '../../wallet/domain/repositories/wallet-ledger.repository.js';

import { WalletPersistenceModule } from '../../wallet/infrastructure/persistence/wallet-persistence.module.js';

import { WagerTransactionRepository } from '../domain/repositories/wager-transaction.repository.js';

import { WageringPersistenceModule } from '../infrastructure/persistence/wagering-persistence.module.js';

import {
  UNIT_OF_WORK,
  type UnitOfWork,
} from '../../../shared/application/ports/unit-of-work.js';

import { DatabaseTransactionModule } from '../../../shared/infrastructure/database/database-transaction.module.js';

import { MessagingPersistenceModule } from '../../messaging/infrastructure/persistence/messaging-persistence.module.js';

import { OutboxMessageRepository } from '../../messaging/domain/repositories/outbox-message.repository.js';

import { ProcessWagerTransactionUseCase } from './use-cases/process-wager-transaction.use-case.js';
import { ReprocessPendingReferencesUseCase } from './use-cases/reprocess-pending-references.use-case.js';
import { PendingReferenceWorkerService } from '../infrastructure/workers/pending-reference-worker.service.js';
import { GetWagerTransactionUseCase } from './use-cases/get-wager-transaction.use-case.js';
import { MetricsService } from '../../../shared/infrastructure/observability/metrics.service.js';

@Module({
  imports: [
    WalletPersistenceModule,
    WageringPersistenceModule,
    DatabaseTransactionModule,
    MessagingPersistenceModule,
  ],

  providers: [
    {
      provide: ProcessWagerTransactionUseCase,

      useFactory: (
        walletRepository: WalletRepository,

        walletLedgerRepository: WalletLedgerRepository,

        wagerTransactionRepository: WagerTransactionRepository,

        unitOfWork: UnitOfWork,

        outboxRepository: OutboxMessageRepository,
        metrics: MetricsService,
      ) =>
        new ProcessWagerTransactionUseCase(
          walletRepository,
          walletLedgerRepository,
          wagerTransactionRepository,
          unitOfWork,
          outboxRepository,
          metrics,
        ),

      inject: [
        WALLET_REPOSITORY,
        WALLET_LEDGER_REPOSITORY,
        WagerTransactionRepository,
        UNIT_OF_WORK,
        OutboxMessageRepository,
        MetricsService,
      ],
    },
    {
      provide: ReprocessPendingReferencesUseCase,
      useFactory: (
        walletRepository: WalletRepository,
        walletLedgerRepository: WalletLedgerRepository,
        wagerTransactionRepository: WagerTransactionRepository,
        outboxRepository: OutboxMessageRepository,
        unitOfWork: UnitOfWork,
      ) =>
        new ReprocessPendingReferencesUseCase(
          walletRepository,
          walletLedgerRepository,
          wagerTransactionRepository,
          outboxRepository,
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
    PendingReferenceWorkerService,
    {
      provide: GetWagerTransactionUseCase,
      useFactory: (repository: WagerTransactionRepository) =>
        new GetWagerTransactionUseCase(repository),
      inject: [WagerTransactionRepository],
    },
  ],

  exports: [
    ProcessWagerTransactionUseCase,
    ReprocessPendingReferencesUseCase,
    GetWagerTransactionUseCase,
  ],
})
export class WageringApplicationModule {}
