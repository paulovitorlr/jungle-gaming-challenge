import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';

import { WALLET_LEDGER_REPOSITORY } from '../../domain/repositories/wallet-ledger.repository.js';
import { WalletLedgerOrmEntity } from './mikro-orm/entities/wallet-ledger.orm-entity.js';
import { MikroOrmWalletLedgerRepository } from './mikro-orm/repositories/mikro-orm-wallet-ledger.repository.js';
import { WalletOrmEntity } from './mikro-orm/entities/wallet.orm-entity.js';
import { WALLET_REPOSITORY } from '../../domain/repositories/wallet.repository.js';
import { MikroOrmWalletRepository } from './mikro-orm/repositories/mikro-orm-wallet.repository.js';

@Module({
  imports: [
    MikroOrmModule.forFeature([WalletOrmEntity, WalletLedgerOrmEntity]),
  ],
  providers: [
    {
      provide: WALLET_REPOSITORY,
      useClass: MikroOrmWalletRepository,
    },
    {
      provide: WALLET_LEDGER_REPOSITORY,
      useClass: MikroOrmWalletLedgerRepository,
    },
  ],
  exports: [WALLET_REPOSITORY, WALLET_LEDGER_REPOSITORY],
})
export class WalletPersistenceModule {}
