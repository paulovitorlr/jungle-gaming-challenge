import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';

import { WagerTransactionRepository } from '../../domain/repositories/wager-transaction.repository.js';

import { WagerTransactionOrmEntity } from './mikro-orm/entities/wager-transaction.orm-entity.js';

import { MikroOrmWagerTransactionRepository } from './mikro-orm/repositories/mikro-orm-wager-transaction.repository.js';

@Module({
  imports: [
    MikroOrmModule.forFeature([
      WagerTransactionOrmEntity,
    ]),
  ],

  providers: [
    {
      provide:
        WagerTransactionRepository,

      useClass:
        MikroOrmWagerTransactionRepository,
    },
  ],

  exports: [
    WagerTransactionRepository,
  ],
})
export class WageringPersistenceModule {}