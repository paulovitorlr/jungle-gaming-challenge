import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';

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
}