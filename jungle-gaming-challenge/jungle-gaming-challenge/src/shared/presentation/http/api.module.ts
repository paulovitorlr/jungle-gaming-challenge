import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { WalletApplicationModule } from '../../../modules/wallet/application/wallet-application.module.js';
import { WalletController } from '../../../modules/wallet/presentation/http/wallet.controller.js';
import { WageringApplicationModule } from '../../../modules/wagering/application/wagering-application.module.js';
import { WageringController } from '../../../modules/wagering/presentation/http/wagering.controller.js';
import {
  NoopAuthGuard,
  NoopProviderIdentityAdapter,
  ProviderIdentityPort,
} from '../auth/noop-auth.guard.js';
import { ApiExceptionFilter } from './api-exception.filter.js';

@Module({
  imports: [WalletApplicationModule, WageringApplicationModule],
  controllers: [WalletController, WageringController],
  providers: [
    NoopProviderIdentityAdapter,
    {
      provide: ProviderIdentityPort,
      useExisting: NoopProviderIdentityAdapter,
    },
    NoopAuthGuard,
    {
      provide: APP_FILTER,
      useClass: ApiExceptionFilter,
    },
  ],
})
export class ApiModule {}
