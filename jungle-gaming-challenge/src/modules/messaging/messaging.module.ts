import { Module } from '@nestjs/common';

import { DatabaseTransactionModule } from '../../shared/infrastructure/database/database-transaction.module.js';

import { WageringApplicationModule } from '../wagering/application/wagering-application.module.js';

import { ProcessWagerMessageUseCase } from './application/use-cases/process-wager-message.use-case.js';

import { IntegrationEventPublisher } from './application/ports/integration-event-publisher.js';

import { PublishOutboxMessagesUseCase } from './application/use-cases/publish-outbox-messages.use-case.js';

import { MessagingPersistenceModule } from './infrastructure/persistence/messaging-persistence.module.js';

import { SqsClientService } from './infrastructure/sqs/sqs-client.service.js';

import { SqsWagerConsumerService } from './infrastructure/sqs/sqs-wager-consumer.service.js';

import { SqsIntegrationEventPublisherService } from './infrastructure/sqs/sqs-integration-event-publisher.service.js';

import { OutboxPublisherService } from './infrastructure/outbox/outbox-publisher.service.js';

@Module({
  imports: [
    MessagingPersistenceModule,
    WageringApplicationModule,
    DatabaseTransactionModule,
  ],

  providers: [
    SqsClientService,
    SqsIntegrationEventPublisherService,
    {
      provide: IntegrationEventPublisher,
      useExisting: SqsIntegrationEventPublisherService,
    },
    ProcessWagerMessageUseCase,
    PublishOutboxMessagesUseCase,
    SqsWagerConsumerService,
    OutboxPublisherService,
  ],

  exports: [
    SqsClientService,
    IntegrationEventPublisher,
    ProcessWagerMessageUseCase,
    PublishOutboxMessagesUseCase,
    MessagingPersistenceModule,
  ],
})
export class MessagingModule {}
