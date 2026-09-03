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
      ) =>
        new ProcessWagerTransactionUseCase(
          walletRepository,
          walletLedgerRepository,
          wagerTransactionRepository,
          unitOfWork,
          outboxRepository,
        ),

      inject: [
        WALLET_REPOSITORY,
        WALLET_LEDGER_REPOSITORY,
        WagerTransactionRepository,
        UNIT_OF_WORK,
        OutboxMessageRepository,
      ],
    },
  ],

  exports: [ProcessWagerTransactionUseCase],
})
export class WageringApplicationModule {}
