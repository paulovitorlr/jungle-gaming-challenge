import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';

import { WagerTransaction } from '../../../../domain/entities/wager-transaction.js'; 
import { WagerTransactionRepository } from '../../../../domain/repositories/wager-transaction.repository.js'; 
import { WagerTransactionId } from '../../../../domain/value-objects/wager-transaction-id.vo.js'; 

import { WagerTransactionOrmEntity } from '../entities/wager-transaction.orm-entity.js';
import { WagerTransactionMapper } from '../mappers/wager-transaction.mapper.js';

@Injectable()
export class MikroOrmWagerTransactionRepository
  implements WagerTransactionRepository
{
  constructor(
    private readonly entityManager: EntityManager,
  ) {}

  async findById(
    id: WagerTransactionId,
  ): Promise<WagerTransaction | null> {
    const entity = await this.entityManager.findOne(
      WagerTransactionOrmEntity,
      {
        id: id.toString(),
      },
    );

    return entity
      ? WagerTransactionMapper.toDomain(entity)
      : null;
  }

  async findByIdempotencyKey(
    providerId: string,
    idempotencyKey: string,
  ): Promise<WagerTransaction | null> {
    const entity = await this.entityManager.findOne(
      WagerTransactionOrmEntity,
      {
        providerId,
        idempotencyKey,
      },
    );

    return entity
      ? WagerTransactionMapper.toDomain(entity)
      : null;
  }

  async findByProviderAndExternalTransactionId(
    providerId: string,
    externalTransactionId: string,
  ): Promise<WagerTransaction | null> {
    const entity = await this.entityManager.findOne(
      WagerTransactionOrmEntity,
      {
        providerId,
        externalTransactionId,
      },
    );

    return entity
      ? WagerTransactionMapper.toDomain(entity)
      : null;
  }

  async save(
    transaction: WagerTransaction,
  ): Promise<void> {
    const entity =
      WagerTransactionMapper.toPersistence(transaction);

    this.entityManager.persist(entity);
  }
}