import { Money } from '../../../../shared/domain/value-objects/money.vo.js';
import { WalletId } from '../../../../shared/domain/value-objects/wallet-id.vo.js';
import { WagerFailureCode } from '../enums/wager-failure-code.enum.js';
import { WagerTransactionKind } from '../enums/wager-transaction-kind.enum.js';
import { WagerTransactionStatus } from '../enums/wager-transaction-status.enum.js';
import { InvalidWagerTransactionError } from '../errors/invalid-wager-transaction.error.js';
import { WagerTransactionId } from '../value-objects/wager-transaction-id.vo.js';
import { InvalidTransactionStateError } from '../errors/invalid-transaction-state.error.js';
import { LedgerDirection } from '../../../wallet/domain/enums/ledger-direction.enum.js';
import { InvalidWagerReferenceError } from '../errors/invalid-wager-reference.error.js';

export type CreateWagerTransactionProps = {
  providerId: string;
  externalTransactionId: string;
  idempotencyKey: string;
  payloadHash: string;
  walletId: WalletId;
  playerId: string;
  roundId: string;
  gameId: string;
  kind: WagerTransactionKind;
  money: Money;
  referenceExternalTransactionId?: string;
  createdAt?: Date;
};

export type WagerTransactionState = {
  id: WagerTransactionId;
  providerId: string;
  externalTransactionId: string;
  idempotencyKey: string;
  payloadHash: string;
  walletId: WalletId;
  playerId: string;
  roundId: string;
  gameId: string;
  kind: WagerTransactionKind;
  money: Money;
  referenceExternalTransactionId?: string;
  createdAt: Date;
  status: WagerTransactionStatus;
  referenceTransactionId?: string;
  failureCode?: WagerFailureCode;
  processedAt?: Date;
  resultingBalance?: Money;
};

export class WagerTransaction {
  private constructor(
    public readonly id: WagerTransactionId,
    public readonly providerId: string,
    public readonly externalTransactionId: string,
    public readonly idempotencyKey: string,
    public readonly payloadHash: string,
    public readonly walletId: WalletId,
    public readonly playerId: string,
    public readonly roundId: string,
    public readonly gameId: string,
    public readonly kind: WagerTransactionKind,
    public readonly money: Money,
    public readonly referenceExternalTransactionId: string | undefined,
    public readonly createdAt: Date,
    private _status: WagerTransactionStatus,
    private _referenceTransactionId?: string,
    private _failureCode?: WagerFailureCode,
    private _processedAt?: Date,
    private _resultingBalance?: Money,
  ) {}

  static create(props: CreateWagerTransactionProps): WagerTransaction {
    WagerTransaction.assertRequired(
      props.providerId,
      'Provider id is required',
    );
    WagerTransaction.assertRequired(
      props.externalTransactionId,
      'External transaction id is required',
    );
    WagerTransaction.assertRequired(
      props.idempotencyKey,
      'Idempotency key is required',
    );
    WagerTransaction.assertRequired(
      props.payloadHash,
      'Payload hash is required',
    );
    WagerTransaction.assertRequired(props.playerId, 'Player id is required');
    WagerTransaction.assertRequired(props.roundId, 'Round id is required');
    WagerTransaction.assertRequired(props.gameId, 'Game id is required');

    if (!props.money.isPositive()) {
      throw new InvalidWagerTransactionError(
        'Wager transaction money must be positive',
      );
    }

    const requiresReference =
      props.kind === WagerTransactionKind.Refund ||
      props.kind === WagerTransactionKind.Rollback;

    if (
      requiresReference &&
      (!props.referenceExternalTransactionId ||
        props.referenceExternalTransactionId.trim().length === 0)
    ) {
      throw new InvalidWagerTransactionError(
        `${props.kind} requires an external transaction reference`,
      );
    }

    return new WagerTransaction(
      WagerTransactionId.create(),
      props.providerId,
      props.externalTransactionId,
      props.idempotencyKey,
      props.payloadHash,
      props.walletId,
      props.playerId,
      props.roundId,
      props.gameId,
      props.kind,
      props.money,
      props.referenceExternalTransactionId,
      props.createdAt ?? new Date(),
      WagerTransactionStatus.Pending,
    );
  }

  static rehydrate(state: WagerTransactionState): WagerTransaction {
    return new WagerTransaction(
      state.id,
      state.providerId,
      state.externalTransactionId,
      state.idempotencyKey,
      state.payloadHash,
      state.walletId,
      state.playerId,
      state.roundId,
      state.gameId,
      state.kind,
      state.money,
      state.referenceExternalTransactionId,
      state.createdAt,
      state.status,
      state.referenceTransactionId,
      state.failureCode,
      state.processedAt,
      state.resultingBalance,
    );
  }

  assertValidReference(reference?: WagerTransaction): void {
    if (!reference) {
      throw new InvalidWagerReferenceError(
        WagerFailureCode.ReferenceNotFound,
        'Referenced transaction was not found',
      );
    }

    const hasMatchingScope =
      this.providerId === reference.providerId &&
      this.referenceExternalTransactionId === reference.externalTransactionId &&
      this.playerId === reference.playerId &&
      this.walletId.equals(reference.walletId) &&
      this.money.currency === reference.money.currency &&
      this.roundId === reference.roundId;

    if (!hasMatchingScope) {
      throw new InvalidWagerReferenceError(
        WagerFailureCode.ReferenceScopeMismatch,
        'Referenced transaction does not belong to the same scope',
      );
    }

    const allowedKinds = this.allowedReferenceKinds();

    if (!allowedKinds.includes(reference.kind)) {
      throw new InvalidWagerReferenceError(
        WagerFailureCode.InvalidReferenceType,
        `${this.kind} cannot reference ${reference.kind}`,
      );
    }

    if (reference.status !== WagerTransactionStatus.Processed) {
      throw new InvalidWagerReferenceError(
        WagerFailureCode.ReferenceNotProcessed,
        'Referenced transaction must be processed',
      );
    }

    if (!this.money.equals(reference.money)) {
      throw new InvalidWagerReferenceError(
        WagerFailureCode.ReferenceAmountMismatch,
        'Referenced transaction must have the same monetary amount',
      );
    }
  }
  private allowedReferenceKinds(): WagerTransactionKind[] {
    switch (this.kind) {
      case WagerTransactionKind.Refund:
        return [WagerTransactionKind.Bet];

      case WagerTransactionKind.Rollback:
        return [
          WagerTransactionKind.Bet,
          WagerTransactionKind.Win,
          WagerTransactionKind.Refund,
        ];

      case WagerTransactionKind.Win:
        return [WagerTransactionKind.Bet];

      default:
        return [];
    }
  }

  get status(): WagerTransactionStatus {
    return this._status;
  }

  get referenceTransactionId(): string | undefined {
    return this._referenceTransactionId;
  }

  get failureCode(): WagerFailureCode | undefined {
    return this._failureCode;
  }

  get processedAt(): Date | undefined {
    return this._processedAt;
  }

  get resultingBalance(): Money | undefined {
    return this._resultingBalance;
  }

  isTerminal(): boolean {
    return (
      this._status === WagerTransactionStatus.Processed ||
      this._status === WagerTransactionStatus.Rejected ||
      this._status === WagerTransactionStatus.Failed
    );
  }

  affectsBalance(): boolean {
    return this.kind !== WagerTransactionKind.Loss;
  }

  ledgerDirectionFor(reference?: WagerTransaction): LedgerDirection {
    switch (this.kind) {
      case WagerTransactionKind.Opening:
      case WagerTransactionKind.Win:
      case WagerTransactionKind.Refund:
        return LedgerDirection.Credit;

      case WagerTransactionKind.Bet:
        return LedgerDirection.Debit;

      case WagerTransactionKind.Loss:
        throw new InvalidWagerTransactionError(
          'LOSS does not produce a ledger entry',
        );

      case WagerTransactionKind.Rollback:
        return this.rollbackDirectionFor(reference);
    }
  }

  private rollbackDirectionFor(reference?: WagerTransaction): LedgerDirection {
    if (!reference) {
      throw new InvalidWagerTransactionError(
        'ROLLBACK requires the referenced transaction',
      );
    }

    const allowedReferenceKinds = [
      WagerTransactionKind.Bet,
      WagerTransactionKind.Win,
      WagerTransactionKind.Refund,
    ];

    if (!allowedReferenceKinds.includes(reference.kind)) {
      throw new InvalidWagerTransactionError(
        `ROLLBACK cannot reference ${reference.kind}`,
      );
    }

    const referenceDirection = reference.ledgerDirectionFor();

    return referenceDirection === LedgerDirection.Debit
      ? LedgerDirection.Credit
      : LedgerDirection.Debit;
  }

  requiresReference(): boolean {
    return (
      this.kind === WagerTransactionKind.Refund ||
      this.kind === WagerTransactionKind.Rollback
    );
  }

  matchesPayload(payloadHash: string): boolean {
    return this.payloadHash === payloadHash;
  }

  markProcessed(
    referenceTransactionId: string | undefined,
    resultingBalance: Money,
    at: Date,
  ): void {
    this.ensureNotTerminal();

    if (
      this.requiresReference() &&
      (!referenceTransactionId || referenceTransactionId.trim().length === 0)
    ) {
      throw new InvalidWagerTransactionError(
        `${this.kind} requires a resolved transaction reference`,
      );
    }

    this._referenceTransactionId = referenceTransactionId;
    this._resultingBalance = resultingBalance;
    this._processedAt = at;
    this._status = WagerTransactionStatus.Processed;
  }

  markPendingReference(): void {
    this.ensureNotTerminal();

    if (!this.requiresReference()) {
      throw new InvalidWagerTransactionError(
        `${this.kind} does not require a transaction reference`,
      );
    }

    this._status = WagerTransactionStatus.PendingReference;
  }

  reject(code: WagerFailureCode, resultingBalance: Money): void {
    this.ensureNotTerminal();

    this._failureCode = code;
    this._resultingBalance = resultingBalance;
    this._status = WagerTransactionStatus.Rejected;
  }

  fail(code: WagerFailureCode): void {
    this.ensureNotTerminal();

    this._failureCode = code;
    this._status = WagerTransactionStatus.Failed;
  }

  private ensureNotTerminal(): void {
    if (this.isTerminal()) {
      throw new InvalidTransactionStateError(this._status);
    }
  }

  private static assertRequired(value: string, message: string): void {
    if (!value || value.trim().length === 0) {
      throw new InvalidWagerTransactionError(message);
    }
  }
}
