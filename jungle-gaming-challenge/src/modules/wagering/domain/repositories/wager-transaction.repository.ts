import { WagerTransaction } from '../entities/wager-transaction.js';
import { WagerTransactionId } from '../value-objects/wager-transaction-id.vo.js';

export abstract class WagerTransactionRepository {
  abstract findById(id: WagerTransactionId): Promise<WagerTransaction | null>;

  abstract findByIdempotencyKey(
    providerId: string,
    idempotencyKey: string,
  ): Promise<WagerTransaction | null>;

  abstract findByProviderAndExternalTransactionId(
    providerId: string,
    externalTransactionId: string,
  ): Promise<WagerTransaction | null>;

  abstract save(transaction: WagerTransaction): Promise<void>;
}
