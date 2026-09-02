import { Module } from '@nestjs/common';
import {
  ConfigModule,
  ConfigService,
} from '@nestjs/config';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import { Migrator } from '@mikro-orm/migrations';

import { AppController } from './app.controller.js';

import {
  WalletPersistenceModule,
} from './modules/wallet/infrastructure/persistence/wallet-persistence.module.js';

import {
  WageringPersistenceModule,
} from './modules/wagering/infrastructure/persistence/wagering-persistence.module.js';

import {
  DatabaseTransactionModule,
} from './shared/infrastructure/database/database-transaction.module.js';

import { MessagingModule } from './modules/messaging/messaging.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    MikroOrmModule.forRootAsync({
      driver: PostgreSqlDriver,
      inject: [ConfigService],

      useFactory: (
        configService: ConfigService,
      ) => ({
        host:
          configService.getOrThrow<string>('DATABASE_HOST'),

        port: Number(
          configService.getOrThrow<string>('DATABASE_PORT'),
        ),

        dbName:
          configService.getOrThrow<string>('DATABASE_NAME'),

        user:
          configService.getOrThrow<string>('DATABASE_USER'),

        password:
          configService.getOrThrow<string>('DATABASE_PASSWORD'),

        autoLoadEntities: true,

        extensions: [Migrator],
      }),
    }),

    DatabaseTransactionModule,

    WalletPersistenceModule,

    WageringPersistenceModule,

    MessagingModule,
  ],

  controllers: [
    AppController,
  ],
})
export class AppModule { }