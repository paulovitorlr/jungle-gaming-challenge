import { WagerTransaction } from '../entities/wager-transaction.js';
import { WagerTransactionId } from '../value-objects/wager-transaction-id.vo.js';
import { WagerTransactionKind } from '../enums/wager-transaction-kind.enum.js';

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

  abstract findProcessedReversal(
    referenceTransactionId: string,
    kind: WagerTransactionKind,
  ): Promise<WagerTransaction | null>;

  abstract claimPendingReferences(options: {
    now: Date;
    limit: number;
    lockId: string;
    lockedUntil: Date;
  }): Promise<WagerTransaction[]>;

  abstract updateClaimedReference(
    transaction: WagerTransaction,
    lockId: string,
  ): Promise<boolean>;

  abstract save(transaction: WagerTransaction): Promise<void>;
}
