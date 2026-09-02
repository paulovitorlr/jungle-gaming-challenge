import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';

import { InboxMessage } from '../../../../domain/entities/inbox-message.js';
import { InboxMessageRepository } from '../../../../domain/repositories/inbox-message.repository.js';
import { InboxMessageOrmEntity } from '../entities/inbox-message.orm-entity.js';
import { InboxMessageMapper } from '../mappers/inbox-message.mapper.js';

@Injectable()
export class MikroOrmInboxMessageRepository
  implements InboxMessageRepository
{
  constructor(
    private readonly entityManager: EntityManager,
  ) {}

  async findByIdentity(
    consumerName: string,
    messageId: string,
  ): Promise<InboxMessage | null> {
    const entity = await this.entityManager.findOne(
      InboxMessageOrmEntity,
      {
        consumerName,
        messageId,
      },
    );

    return entity
      ? InboxMessageMapper.toDomain(entity)
      : null;
  }

  async add(
    message: InboxMessage,
  ): Promise<void> {
    const entity =
      InboxMessageMapper.toPersistence(message);

    this.entityManager.persist(entity);
  }
}