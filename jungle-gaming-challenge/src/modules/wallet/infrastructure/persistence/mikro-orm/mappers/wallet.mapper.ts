import { Wallet } from '../../../../../../shared/domain/entities/wallet.entity.js';
import { Money } from '../../../../../../shared/domain/value-objects/money.vo.js';
import { WalletId } from '../../../../../../shared/domain/value-objects/wallet-id.vo.js';
import { WalletOrmEntity } from '../entities/wallet.orm-entity.js';

export class WalletMapper {
  static toPersistence(wallet: Wallet): WalletOrmEntity {
    const entity = new WalletOrmEntity();

    entity.id = wallet.id.toString();
    entity.playerId = wallet.playerId;
    entity.currency = wallet.currency;
    entity.balance = wallet.balance.toString();
    entity.version = wallet.version;
    entity.createdAt = wallet.createdAt;
    entity.updatedAt = wallet.updatedAt;

    return entity;
  }

  static toDomain(entity: WalletOrmEntity): Wallet {
    return Wallet.rehydrate({
      id: WalletId.from(entity.id),
      playerId: entity.playerId,
      currency: entity.currency,
      balance: Money.from({
        amount: entity.balance,
        currency: entity.currency,
      }),
      version: entity.version,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    });
  }
}