import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';

import { InboxMessageRepository } from '../../domain/repositories/inbox-message.repository.js';

import { OutboxMessageRepository } from '../../domain/repositories/outbox-message.repository.js';

import { InboxMessageOrmEntity } from './mikro-orm/entities/inbox-message.orm-entity.js';

import { OutboxMessageOrmEntity } from './mikro-orm/entities/outbox-message.orm-entity.js';

import { MikroOrmInboxMessageRepository } from './mikro-orm/repositories/mikro-orm-inbox-message.repository.js';

import { MikroOrmOutboxMessageRepository } from './mikro-orm/repositories/mikro-orm-outbox-message.repository.js';

@Module({
  imports: [
    MikroOrmModule.forFeature([InboxMessageOrmEntity, OutboxMessageOrmEntity]),
  ],

  providers: [
    {
      provide: InboxMessageRepository,
      useClass: MikroOrmInboxMessageRepository,
    },
    {
      provide: OutboxMessageRepository,
      useClass: MikroOrmOutboxMessageRepository,
    },
  ],

  exports: [InboxMessageRepository, OutboxMessageRepository],
})
export class MessagingPersistenceModule {}
