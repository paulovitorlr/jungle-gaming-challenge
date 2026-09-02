import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { WalletId } from '../../../../../../shared/domain/value-objects/wallet-id.vo.js';
import { WalletLedgerOrmEntity } from '../entities/wallet-ledger.orm-entity.js';
import {
  WalletLedgerRepository,
} from '../../../../domain/repositories/wallet-ledger.repository.js';
import { WalletLedgerEntry } from '../../../../domain/entities/wallet-ledger-entry.js';
import { WalletLedgerMapper } from '../mappers/wallet-ledger.mapper.js';

@Injectable()
export class MikroOrmWalletLedgerRepository
  implements WalletLedgerRepository
{
 constructor(
  private readonly entityManager: EntityManager,
) {}

  async add(entry: WalletLedgerEntry): Promise<void> {
    const entity = WalletLedgerMapper.toPersistence(entry);

    this.entityManager.persist(entity);
  }
  async findByWalletId(
  walletId: WalletId,
): Promise<WalletLedgerEntry[]> {
  const entities = await this.entityManager.find(
    WalletLedgerOrmEntity,
    {
      walletId: walletId.toString(),
    },
    {
      orderBy: {
        createdAt: 'asc',
        id: 'asc',
      },
    },
  );

  return entities.map(WalletLedgerMapper.toDomain);
}
}