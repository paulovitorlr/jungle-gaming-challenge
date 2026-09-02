import { Module } from '@nestjs/common';

import { DatabaseTransactionModule } from '../../shared/infrastructure/database/database-transaction.module.js';

import { WageringApplicationModule } from '../wagering/application/wagering-application.module.js';

import { ProcessWagerMessageUseCase } from './application/use-cases/process-wager-message.use-case.js';

import { MessagingPersistenceModule } from './infrastructure/persistence/messaging-persistence.module.js';

import { SqsClientService } from './infrastructure/sqs/sqs-client.service.js';

import { SqsWagerConsumerService } from './infrastructure/sqs/sqs-wager-consumer.service.js';

@Module({
  imports: [
    MessagingPersistenceModule,
    WageringApplicationModule,
    DatabaseTransactionModule,
  ],

  providers: [
    SqsClientService,
    ProcessWagerMessageUseCase,
    SqsWagerConsumerService,
  ],

  exports: [
    SqsClientService,
    ProcessWagerMessageUseCase,
    MessagingPersistenceModule,
  ],
})
export class MessagingModule {}