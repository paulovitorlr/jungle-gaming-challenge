import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';

import { InboxMessageRepository } from '../../domain/repositories/inbox-message.repository.js';
import { InboxMessageOrmEntity } from './mikro-orm/entities/inbox-message.orm-entity.js';
import { MikroOrmInboxMessageRepository } from './mikro-orm/repositories/mikro-orm-inbox-message.repository.js';

@Module({
  imports: [
    MikroOrmModule.forFeature([
      InboxMessageOrmEntity,
    ]),
  ],

  providers: [
    {
      provide: InboxMessageRepository,
      useClass: MikroOrmInboxMessageRepository,
    },
  ],

  exports: [
    InboxMessageRepository,
  ],
})
export class MessagingPersistenceModule {}