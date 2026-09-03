import { describe, expect, it, mock } from 'bun:test';
import { EntityManager } from '@mikro-orm/postgresql';

import { Money } from '../../../../../../shared/domain/value-objects/money.vo.js';
import { WalletId } from '../../../../../../shared/domain/value-objects/wallet-id.vo.js';
import { WalletLedgerEntry } from '../../../../domain/entities/wallet-ledger-entry.js';
import { LedgerDirection } from '../../../../domain/enums/ledger-direction.enum.js';
import { WalletLedgerOrmEntity } from '../entities/wallet-ledger.orm-entity.js';
import { MikroOrmWalletLedgerRepository } from './mikro-orm-wallet-ledger.repository.js';

describe('MikroOrmWalletLedgerRepository', () => {
  it('should register ledger entry without flushing', async () => {
    const entityManager = {
      persist: mock(),
      flush: mock(),
    };

    const repository = new MikroOrmWalletLedgerRepository(
      entityManager as unknown as EntityManager,
    );

    const entry = WalletLedgerEntry.create({
      id: 'ledger-entry-1',
      walletId: WalletId.from('wallet-123'),
      transactionId: 'transaction-1',
      direction: LedgerDirection.Credit,
      money: Money.from({
        amount: '100.00',
        currency: 'BRL',
      }),
      balanceBefore: Money.from({
        amount: '0.00',
        currency: 'BRL',
      }),
      balanceAfter: Money.from({
        amount: '100.00',
        currency: 'BRL',
      }),
      createdAt: new Date('2026-09-02T12:00:00.000Z'),
    });

    await repository.add(entry);

    expect(entityManager.persist).toHaveBeenCalledTimes(1);

    const persisted = entityManager.persist.mock.calls[0][0];

    expect(persisted).toBeInstanceOf(WalletLedgerOrmEntity);
    expect(persisted.id).toBe('ledger-entry-1');
    expect(persisted.walletId).toBe('wallet-123');
    expect(persisted.amount).toBe('100.00');
    expect(persisted.balanceBefore).toBe('0.00');
    expect(persisted.balanceAfter).toBe('100.00');

    expect(entityManager.flush).not.toHaveBeenCalled();
  });
});
