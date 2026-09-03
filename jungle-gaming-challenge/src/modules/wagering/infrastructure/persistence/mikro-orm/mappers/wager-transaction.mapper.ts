import { Money } from '../../../../../../shared/domain/value-objects/money.vo.js';
import { WalletId } from '../../../../../../shared/domain/value-objects/wallet-id.vo.js';

import { WagerTransaction } from '../../../../domain/entities/wager-transaction.js';
import { WagerFailureCode } from '../../../../domain/enums/wager-failure-code.enum.js';
import { WagerTransactionKind } from '../../../../domain/enums/wager-transaction-kind.enum.js';
import { WagerTransactionStatus } from '../../../../domain/enums/wager-transaction-status.enum.js';
import { WagerTransactionId } from '../../../../domain/value-objects/wager-transaction-id.vo.js';

import { WagerTransactionOrmEntity } from '../entities/wager-transaction.orm-entity.js';

export class WagerTransactionMapper {
  static toDomain(entity: WagerTransactionOrmEntity): WagerTransaction {
    return WagerTransaction.rehydrate({
      id: WagerTransactionId.from(entity.id),

      providerId: entity.providerId,
      externalTransactionId: entity.externalTransactionId,

      idempotencyKey: entity.idempotencyKey,
      payloadHash: entity.payloadHash,

      walletId: WalletId.from(entity.walletId),

      playerId: entity.playerId,
      roundId: entity.roundId,
      gameId: entity.gameId,

      kind: entity.kind as WagerTransactionKind,

      money: Money.from({
        amount: entity.amount,
        currency: entity.currency,
      }),

      referenceExternalTransactionId: entity.referenceExternalTransactionId,

      createdAt: entity.createdAt,

      status: entity.status as WagerTransactionStatus,

      referenceTransactionId: entity.referenceTransactionId,

      failureCode: entity.failureCode
        ? (entity.failureCode as WagerFailureCode)
        : undefined,

      processedAt: entity.processedAt,
    });
  }

  static toPersistence(
    transaction: WagerTransaction,
  ): WagerTransactionOrmEntity {
    const entity = new WagerTransactionOrmEntity();

    entity.id = transaction.id.toString();

    entity.providerId = transaction.providerId;

    entity.externalTransactionId = transaction.externalTransactionId;

    entity.idempotencyKey = transaction.idempotencyKey;

    entity.payloadHash = transaction.payloadHash;

    entity.walletId = transaction.walletId.toString();

    entity.playerId = transaction.playerId;

    entity.roundId = transaction.roundId;

    entity.gameId = transaction.gameId;

    entity.kind = transaction.kind;

    entity.amount = transaction.money.toString();

    entity.currency = transaction.money.currency;

    entity.referenceExternalTransactionId =
      transaction.referenceExternalTransactionId;

    entity.referenceTransactionId = transaction.referenceTransactionId;

    entity.status = transaction.status;

    entity.failureCode = transaction.failureCode;

    entity.createdAt = transaction.createdAt;

    entity.processedAt = transaction.processedAt;

    return entity;
  }
}
