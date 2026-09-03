import { WagerTransactionId } from '../../domain/value-objects/wager-transaction-id.vo.js';
import type { WagerTransaction } from '../../domain/entities/wager-transaction.js';
import type { WagerTransactionRepository } from '../../domain/repositories/wager-transaction.repository.js';

export class GetWagerTransactionUseCase {
  constructor(private readonly transactions: WagerTransactionRepository) {}

  async byId(id: string) {
    return this.toOutput(
      await this.transactions.findById(WagerTransactionId.from(id)),
    );
  }

  async byProviderAndExternalId(providerId: string, externalId: string) {
    return this.toOutput(
      await this.transactions.findByProviderAndExternalTransactionId(
        providerId,
        externalId,
      ),
    );
  }

  private toOutput(transaction: WagerTransaction | null) {
    if (!transaction) return null;
    return {
      id: transaction.id.toString(),
      providerId: transaction.providerId,
      externalTransactionId: transaction.externalTransactionId,
      walletId: transaction.walletId.toString(),
      playerId: transaction.playerId,
      roundId: transaction.roundId,
      gameId: transaction.gameId,
      kind: transaction.kind,
      money: transaction.money.toJSON(),
      referenceExternalTransactionId:
        transaction.referenceExternalTransactionId,
      referenceTransactionId: transaction.referenceTransactionId,
      status: transaction.status,
      failureCode: transaction.failureCode,
      resultingBalance: transaction.resultingBalance?.toJSON(),
      createdAt: transaction.createdAt.toISOString(),
      processedAt: transaction.processedAt?.toISOString(),
    };
  }
}
