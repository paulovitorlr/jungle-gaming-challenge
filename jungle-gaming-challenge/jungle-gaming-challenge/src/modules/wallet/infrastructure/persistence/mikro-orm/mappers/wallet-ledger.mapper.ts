import { Money } from '../../../../../../shared/domain/value-objects/money.vo.js';
import { WalletId } from '../../../../../../shared/domain/value-objects/wallet-id.vo.js';
import { WalletLedgerEntry } from '../../../../domain/entities/wallet-ledger-entry.js';
import { WalletLedgerOrmEntity } from '../entities/wallet-ledger.orm-entity.js';

export class WalletLedgerMapper {
  static toPersistence(entry: WalletLedgerEntry): WalletLedgerOrmEntity {
    const entity = new WalletLedgerOrmEntity();

    entity.id = entry.id;
    entity.walletId = entry.walletId.toString();
    entity.transactionId = entry.transactionId;
    entity.direction = entry.direction;
    entity.amount = entry.money.toString();
    entity.currency = entry.money.currency;
    entity.balanceBefore = entry.balanceBefore.toString();
    entity.balanceAfter = entry.balanceAfter.toString();
    entity.createdAt = entry.createdAt;

    return entity;
  }

  static toDomain(entity: WalletLedgerOrmEntity): WalletLedgerEntry {
    const currency = entity.currency;

    return WalletLedgerEntry.rehydrate({
      id: entity.id,
      walletId: WalletId.from(entity.walletId),
      transactionId: entity.transactionId,
      direction: entity.direction,
      money: Money.from({
        amount: entity.amount,
        currency,
      }),
      balanceBefore: Money.from({
        amount: entity.balanceBefore,
        currency,
      }),
      balanceAfter: Money.from({
        amount: entity.balanceAfter,
        currency,
      }),
      createdAt: entity.createdAt,
    });
  }
}
