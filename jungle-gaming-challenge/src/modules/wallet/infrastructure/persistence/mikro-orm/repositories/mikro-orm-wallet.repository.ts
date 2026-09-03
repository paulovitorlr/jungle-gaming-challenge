import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';

import { Wallet } from '../../../../../../shared/domain/entities/wallet.entity.js';
import { WalletId } from '../../../../../../shared/domain/value-objects/wallet-id.vo.js';
import { WalletRepository } from '../../../../domain/repositories/wallet.repository.js';
import { WalletOrmEntity } from '../entities/wallet.orm-entity.js';
import { WalletMapper } from '../mappers/wallet.mapper.js';

@Injectable()
export class MikroOrmWalletRepository implements WalletRepository {
  constructor(private readonly entityManager: EntityManager) {}

  async findById(id: WalletId): Promise<Wallet | null> {
    const entity = await this.entityManager.findOne(WalletOrmEntity, {
      id: id.toString(),
    });

    return entity ? WalletMapper.toDomain(entity) : null;
  }

  async add(wallet: Wallet): Promise<void> {
    const entity = WalletMapper.toPersistence(wallet);

    this.entityManager.persist(entity);
  }

  async update(wallet: Wallet, expectedVersion: number): Promise<boolean> {
    const entity = WalletMapper.toPersistence(wallet);

    const affectedRows = await this.entityManager.nativeUpdate(
      WalletOrmEntity,
      {
        id: entity.id,
        version: expectedVersion,
      },
      {
        balance: entity.balance,
        version: entity.version,
        updatedAt: entity.updatedAt,
      },
    );

    return affectedRows === 1;
  }
}
