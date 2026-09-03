import { describe, expect, it } from 'bun:test';

import { Money } from '../../../../shared/domain/value-objects/money.vo.js';
import { WalletId } from '../../../../shared/domain/value-objects/wallet-id.vo.js';

import {
  CreateWagerTransactionProps,
  WagerTransaction,
  WagerTransactionState,
} from './wager-transaction.js';

import { WagerTransactionKind } from '../enums/wager-transaction-kind.enum.js';
import { WagerTransactionStatus } from '../enums/wager-transaction-status.enum.js';
import { WagerFailureCode } from '../enums/wager-failure-code.enum.js';
import { LedgerDirection } from '../../../wallet/domain/enums/ledger-direction.enum.js';
import { WagerTransactionId } from '../value-objects/wager-transaction-id.vo.js';
import { InvalidWagerReferenceError } from '../errors/invalid-wager-reference.error.js';

function makeProps(
  overrides: Partial<CreateWagerTransactionProps> = {},
): CreateWagerTransactionProps {
  return {
    providerId: 'provider-a',
    externalTransactionId: 'transaction-123',
    idempotencyKey: 'provider-a:transaction-123',
    payloadHash: 'payload-hash',
    walletId: WalletId.create(),
    playerId: 'player-123',
    roundId: 'round-123',
    gameId: 'game-123',
    kind: WagerTransactionKind.Bet,
    money: Money.from({
      amount: '25.00',
      currency: 'BRL',
    }),
    ...overrides,
  };
}

function processTransaction(transaction: WagerTransaction): WagerTransaction {
  transaction.markProcessed(
    transaction.requiresReference() ? 'resolved-reference-id' : undefined,
    Money.from({
      amount: '75.00',
      currency: 'BRL',
    }),
    new Date('2026-09-01T13:00:00.000Z'),
  );

  return transaction;
}

function createReversal(
  kind: WagerTransactionKind.Refund | WagerTransactionKind.Rollback,
  reference: WagerTransaction,
): WagerTransaction {
  return WagerTransaction.create(
    makeProps({
      providerId: reference.providerId,
      externalTransactionId: `${kind.toLowerCase()}-123`,
      idempotencyKey: `provider-a:${kind.toLowerCase()}-123`,
      walletId: reference.walletId,
      playerId: reference.playerId,
      roundId: reference.roundId,
      gameId: reference.gameId,
      kind,
      money: reference.money,
      referenceExternalTransactionId: reference.externalTransactionId,
    }),
  );
}

function expectReferenceFailure(
  action: () => void,
  expectedCode: WagerFailureCode,
): void {
  try {
    action();

    throw new Error('Expected reference validation to fail');
  } catch (error) {
    expect(error).toBeInstanceOf(InvalidWagerReferenceError);

    expect((error as InvalidWagerReferenceError).code).toBe(expectedCode);
  }
}

describe('WagerTransaction', () => {
  it('should create a pending wager transaction', () => {
    const transaction = WagerTransaction.create(makeProps());

    expect(transaction.id).toBeDefined();

    expect(transaction.status).toBe(WagerTransactionStatus.Pending);

    expect(transaction.providerId).toBe('provider-a');

    expect(transaction.externalTransactionId).toBe('transaction-123');

    expect(transaction.referenceTransactionId).toBeUndefined();

    expect(transaction.failureCode).toBeUndefined();

    expect(transaction.processedAt).toBeUndefined();
  });

  it('should preserve the informed creation date', () => {
    const createdAt = new Date('2026-09-01T12:00:00.000Z');

    const transaction = WagerTransaction.create(
      makeProps({
        createdAt,
      }),
    );

    expect(transaction.createdAt).toEqual(createdAt);
  });

  it('should reject zero money', () => {
    expect(() =>
      WagerTransaction.create(
        makeProps({
          money: Money.zero('BRL'),
        }),
      ),
    ).toThrow('Wager transaction money must be positive');
  });

  it('should reject negative money', () => {
    expect(() =>
      WagerTransaction.create(
        makeProps({
          money: Money.from({
            amount: '-10.00',
            currency: 'BRL',
          }),
        }),
      ),
    ).toThrow('Wager transaction money must be positive');
  });

  it('should require a reference for refund', () => {
    expect(() =>
      WagerTransaction.create(
        makeProps({
          kind: WagerTransactionKind.Refund,
        }),
      ),
    ).toThrow('REFUND requires an external transaction reference');
  });

  it('should require a reference for rollback', () => {
    expect(() =>
      WagerTransaction.create(
        makeProps({
          kind: WagerTransactionKind.Rollback,
        }),
      ),
    ).toThrow('ROLLBACK requires an external transaction reference');
  });

  it('should identify kinds that require a reference', () => {
    const refund = WagerTransaction.create(
      makeProps({
        kind: WagerTransactionKind.Refund,
        referenceExternalTransactionId: 'original-bet',
      }),
    );

    const bet = WagerTransaction.create(makeProps());

    expect(refund.requiresReference()).toBe(true);

    expect(bet.requiresReference()).toBe(false);
  });

  it('should identify whether the transaction affects the balance', () => {
    const loss = WagerTransaction.create(
      makeProps({
        kind: WagerTransactionKind.Loss,
      }),
    );

    const bet = WagerTransaction.create(makeProps());

    expect(loss.affectsBalance()).toBe(false);

    expect(bet.affectsBalance()).toBe(true);
  });

  it('should compare the canonical payload hash', () => {
    const transaction = WagerTransaction.create(makeProps());

    expect(transaction.matchesPayload('payload-hash')).toBe(true);

    expect(transaction.matchesPayload('different-hash')).toBe(false);
  });

  it('should not create a transaction in a terminal state', () => {
    const transaction = WagerTransaction.create(makeProps());

    expect(transaction.isTerminal()).toBe(false);
  });

  it('should mark a transaction as processed', () => {
    const transaction = WagerTransaction.create(makeProps());

    const processedAt = new Date('2026-09-01T13:00:00.000Z');

    const resultingBalance = Money.from({
      amount: '75.00',
      currency: 'BRL',
    });

    transaction.markProcessed(undefined, resultingBalance, processedAt);

    expect(transaction.status).toBe(WagerTransactionStatus.Processed);

    expect(transaction.processedAt).toEqual(processedAt);

    expect(transaction.referenceTransactionId).toBeUndefined();

    expect(transaction.resultingBalance?.toString()).toBe('75.00');

    expect(transaction.isTerminal()).toBe(true);
  });

  it('should require a resolved reference when processing a refund', () => {
    const transaction = WagerTransaction.create(
      makeProps({
        kind: WagerTransactionKind.Refund,
        referenceExternalTransactionId: 'original-bet',
      }),
    );

    expect(() =>
      transaction.markProcessed(
        undefined,
        Money.from({
          amount: '75.00',
          currency: 'BRL',
        }),
        new Date('2026-09-01T13:00:00.000Z'),
      ),
    ).toThrow('REFUND requires a resolved transaction reference');

    expect(transaction.status).toBe(WagerTransactionStatus.Pending);
  });

  it('should store the resolved internal transaction reference', () => {
    const transaction = WagerTransaction.create(
      makeProps({
        kind: WagerTransactionKind.Refund,
        referenceExternalTransactionId: 'original-bet',
      }),
    );

    transaction.markProcessed(
      'internal-bet-id',
      Money.from({
        amount: '75.00',
        currency: 'BRL',
      }),
      new Date('2026-09-01T13:00:00.000Z'),
    );

    expect(transaction.status).toBe(WagerTransactionStatus.Processed);

    expect(transaction.referenceTransactionId).toBe('internal-bet-id');
  });

  it('should mark a transaction as pending reference', () => {
    const transaction = WagerTransaction.create(
      makeProps({
        kind: WagerTransactionKind.Rollback,
        referenceExternalTransactionId: 'original-transaction',
      }),
    );

    transaction.markPendingReference();

    expect(transaction.status).toBe(WagerTransactionStatus.PendingReference);

    expect(transaction.isTerminal()).toBe(false);
  });

  it('should not mark a bet as pending reference', () => {
    const transaction = WagerTransaction.create(makeProps());

    expect(() => transaction.markPendingReference()).toThrow(
      'BET does not require a transaction reference',
    );

    expect(transaction.status).toBe(WagerTransactionStatus.Pending);
  });

  it('should reject a transaction with a stable failure code', () => {
    const transaction = WagerTransaction.create(makeProps());

    transaction.reject(
      WagerFailureCode.InsufficientFunds,
      Money.from({
        amount: '20.00',
        currency: 'BRL',
      }),
    );

    expect(transaction.status).toBe(WagerTransactionStatus.Rejected);

    expect(transaction.failureCode).toBe(WagerFailureCode.InsufficientFunds);

    expect(transaction.resultingBalance?.toString()).toBe('20.00');

    expect(transaction.isTerminal()).toBe(true);
  });

  it('should fail a transaction with a stable failure code', () => {
    const transaction = WagerTransaction.create(makeProps());

    transaction.fail(WagerFailureCode.PermanentInfrastructureFailure);

    expect(transaction.status).toBe(WagerTransactionStatus.Failed);

    expect(transaction.failureCode).toBe(
      WagerFailureCode.PermanentInfrastructureFailure,
    );

    expect(transaction.isTerminal()).toBe(true);
  });

  it('should prevent transitions from terminal states', () => {
    const processed = WagerTransaction.create(makeProps());

    processed.markProcessed(
      undefined,
      Money.from({
        amount: '75.00',
        currency: 'BRL',
      }),
      new Date(),
    );

    const rejected = WagerTransaction.create(makeProps());

    rejected.reject(
      WagerFailureCode.InsufficientFunds,
      Money.from({
        amount: '20.00',
        currency: 'BRL',
      }),
    );

    const failed = WagerTransaction.create(makeProps());

    failed.fail(WagerFailureCode.PermanentInfrastructureFailure);

    expect(() =>
      processed.reject(
        WagerFailureCode.InsufficientFunds,
        Money.from({
          amount: '75.00',
          currency: 'BRL',
        }),
      ),
    ).toThrow(
      'Wager transaction cannot transition from terminal status PROCESSED',
    );

    expect(() =>
      rejected.fail(WagerFailureCode.PermanentInfrastructureFailure),
    ).toThrow(
      'Wager transaction cannot transition from terminal status REJECTED',
    );

    expect(() =>
      failed.markProcessed(
        undefined,
        Money.from({
          amount: '75.00',
          currency: 'BRL',
        }),
        new Date(),
      ),
    ).toThrow(
      'Wager transaction cannot transition from terminal status FAILED',
    );
  });

  it('should return credit for opening, win and refund', () => {
    const opening = WagerTransaction.create(
      makeProps({
        kind: WagerTransactionKind.Opening,
      }),
    );

    const win = WagerTransaction.create(
      makeProps({
        kind: WagerTransactionKind.Win,
      }),
    );

    const refund = WagerTransaction.create(
      makeProps({
        kind: WagerTransactionKind.Refund,
        referenceExternalTransactionId: 'original-bet',
      }),
    );

    expect(opening.ledgerDirectionFor()).toBe(LedgerDirection.Credit);

    expect(win.ledgerDirectionFor()).toBe(LedgerDirection.Credit);

    expect(refund.ledgerDirectionFor()).toBe(LedgerDirection.Credit);
  });

  it('should return debit for a bet', () => {
    const bet = WagerTransaction.create(makeProps());

    expect(bet.ledgerDirectionFor()).toBe(LedgerDirection.Debit);
  });

  it('should not produce a ledger direction for loss', () => {
    const loss = WagerTransaction.create(
      makeProps({
        kind: WagerTransactionKind.Loss,
      }),
    );

    expect(() => loss.ledgerDirectionFor()).toThrow(
      'LOSS does not produce a ledger entry',
    );
  });

  it('should reverse a bet direction as credit', () => {
    const bet = WagerTransaction.create(makeProps());

    const rollback = WagerTransaction.create(
      makeProps({
        kind: WagerTransactionKind.Rollback,
        referenceExternalTransactionId: 'original-bet',
      }),
    );

    expect(rollback.ledgerDirectionFor(bet)).toBe(LedgerDirection.Credit);
  });

  it('should reverse a win direction as debit', () => {
    const win = WagerTransaction.create(
      makeProps({
        kind: WagerTransactionKind.Win,
      }),
    );

    const rollback = WagerTransaction.create(
      makeProps({
        kind: WagerTransactionKind.Rollback,
        referenceExternalTransactionId: 'original-win',
      }),
    );

    expect(rollback.ledgerDirectionFor(win)).toBe(LedgerDirection.Debit);
  });

  it('should reverse a refund direction as debit', () => {
    const refund = WagerTransaction.create(
      makeProps({
        kind: WagerTransactionKind.Refund,
        referenceExternalTransactionId: 'original-bet',
      }),
    );

    const rollback = WagerTransaction.create(
      makeProps({
        kind: WagerTransactionKind.Rollback,
        referenceExternalTransactionId: 'original-refund',
      }),
    );

    expect(rollback.ledgerDirectionFor(refund)).toBe(LedgerDirection.Debit);
  });

  it('should require the referenced transaction to calculate rollback direction', () => {
    const rollback = WagerTransaction.create(
      makeProps({
        kind: WagerTransactionKind.Rollback,
        referenceExternalTransactionId: 'original-transaction',
      }),
    );

    expect(() => rollback.ledgerDirectionFor()).toThrow(
      'ROLLBACK requires the referenced transaction',
    );
  });

  it('should reject an invalid rollback reference kind', () => {
    const loss = WagerTransaction.create(
      makeProps({
        kind: WagerTransactionKind.Loss,
      }),
    );

    const rollback = WagerTransaction.create(
      makeProps({
        kind: WagerTransactionKind.Rollback,
        referenceExternalTransactionId: 'original-loss',
      }),
    );

    expect(() => rollback.ledgerDirectionFor(loss)).toThrow(
      'ROLLBACK cannot reference LOSS',
    );
  });

  it('should rehydrate a processed transaction', () => {
    const createdAt = new Date('2026-09-01T12:00:00.000Z');

    const processedAt = new Date('2026-09-01T12:01:00.000Z');

    const state: WagerTransactionState = {
      id: WagerTransactionId.from('internal-transaction-id'),

      providerId: 'provider-a',

      externalTransactionId: 'refund-123',

      idempotencyKey: 'provider-a:refund-123',

      payloadHash: 'persisted-payload-hash',

      walletId: WalletId.from('wallet-123'),

      playerId: 'player-123',

      roundId: 'round-123',

      gameId: 'game-123',

      kind: WagerTransactionKind.Refund,

      money: Money.from({
        amount: '25.00',
        currency: 'BRL',
      }),

      referenceExternalTransactionId: 'original-bet',

      createdAt,

      status: WagerTransactionStatus.Processed,

      referenceTransactionId: 'internal-bet-id',

      processedAt,

      resultingBalance: Money.from({
        amount: '75.00',
        currency: 'BRL',
      }),
    };

    const transaction = WagerTransaction.rehydrate(state);

    expect(transaction.id.toString()).toBe('internal-transaction-id');

    expect(transaction.status).toBe(WagerTransactionStatus.Processed);

    expect(transaction.referenceTransactionId).toBe('internal-bet-id');

    expect(transaction.createdAt).toEqual(createdAt);

    expect(transaction.processedAt).toEqual(processedAt);

    expect(transaction.resultingBalance?.toString()).toBe('75.00');

    expect(transaction.isTerminal()).toBe(true);
  });

  it('should rehydrate a rejected transaction with its failure code', () => {
    const state: WagerTransactionState = {
      id: WagerTransactionId.from('rejected-transaction-id'),

      providerId: 'provider-a',

      externalTransactionId: 'bet-123',

      idempotencyKey: 'provider-a:bet-123',

      payloadHash: 'persisted-payload-hash',

      walletId: WalletId.from('wallet-123'),

      playerId: 'player-123',

      roundId: 'round-123',

      gameId: 'game-123',

      kind: WagerTransactionKind.Bet,

      money: Money.from({
        amount: '80.00',
        currency: 'BRL',
      }),

      createdAt: new Date('2026-09-01T12:00:00.000Z'),

      status: WagerTransactionStatus.Rejected,

      failureCode: WagerFailureCode.InsufficientFunds,

      resultingBalance: Money.from({
        amount: '20.00',
        currency: 'BRL',
      }),
    };

    const transaction = WagerTransaction.rehydrate(state);

    expect(transaction.status).toBe(WagerTransactionStatus.Rejected);

    expect(transaction.failureCode).toBe(WagerFailureCode.InsufficientFunds);

    expect(transaction.resultingBalance?.toString()).toBe('20.00');

    expect(transaction.isTerminal()).toBe(true);
  });

  it('should accept a processed bet as refund reference', () => {
    const bet = processTransaction(
      WagerTransaction.create(
        makeProps({
          externalTransactionId: 'bet-123',
        }),
      ),
    );

    const refund = createReversal(WagerTransactionKind.Refund, bet);

    expect(() => refund.assertValidReference(bet)).not.toThrow();
  });

  it('should accept bet, win and refund as rollback references', () => {
    const bet = processTransaction(
      WagerTransaction.create(
        makeProps({
          externalTransactionId: 'bet-123',
        }),
      ),
    );

    const win = processTransaction(
      WagerTransaction.create(
        makeProps({
          externalTransactionId: 'win-123',

          kind: WagerTransactionKind.Win,
        }),
      ),
    );

    const refund = processTransaction(
      WagerTransaction.create(
        makeProps({
          externalTransactionId: 'refund-123',

          kind: WagerTransactionKind.Refund,

          referenceExternalTransactionId: 'bet-123',
        }),
      ),
    );

    expect(() =>
      createReversal(WagerTransactionKind.Rollback, bet).assertValidReference(
        bet,
      ),
    ).not.toThrow();

    expect(() =>
      createReversal(WagerTransactionKind.Rollback, win).assertValidReference(
        win,
      ),
    ).not.toThrow();

    expect(() =>
      createReversal(
        WagerTransactionKind.Rollback,
        refund,
      ).assertValidReference(refund),
    ).not.toThrow();
  });

  it('should reject a missing reference', () => {
    const refund = WagerTransaction.create(
      makeProps({
        kind: WagerTransactionKind.Refund,

        referenceExternalTransactionId: 'missing-bet',
      }),
    );

    expectReferenceFailure(
      () => refund.assertValidReference(undefined),

      WagerFailureCode.ReferenceNotFound,
    );
  });

  it('should reject a reference from a different scope', () => {
    const walletId = WalletId.create();

    const refund = WagerTransaction.create(
      makeProps({
        walletId,

        kind: WagerTransactionKind.Refund,

        referenceExternalTransactionId: 'bet-123',
      }),
    );

    const mismatches: Partial<CreateWagerTransactionProps>[] = [
      {
        providerId: 'provider-b',
      },

      {
        playerId: 'different-player',
      },

      {
        walletId: WalletId.create(),
      },

      {
        roundId: 'different-round',
      },

      {
        money: Money.from({
          amount: '25.00',
          currency: 'USD',
        }),
      },
    ];

    for (const mismatch of mismatches) {
      const reference = processTransaction(
        WagerTransaction.create(
          makeProps({
            walletId,

            externalTransactionId: 'bet-123',

            ...mismatch,
          }),
        ),
      );

      expectReferenceFailure(
        () => refund.assertValidReference(reference),

        WagerFailureCode.ReferenceScopeMismatch,
      );
    }
  });

  it('should reject a reference with an invalid transaction kind', () => {
    const loss = processTransaction(
      WagerTransaction.create(
        makeProps({
          externalTransactionId: 'loss-123',

          kind: WagerTransactionKind.Loss,
        }),
      ),
    );

    const refund = createReversal(WagerTransactionKind.Refund, loss);

    expectReferenceFailure(
      () => refund.assertValidReference(loss),

      WagerFailureCode.InvalidReferenceType,
    );
  });

  it('should reject a reference that has not been processed', () => {
    const pendingBet = WagerTransaction.create(
      makeProps({
        externalTransactionId: 'bet-123',
      }),
    );

    const refund = createReversal(WagerTransactionKind.Refund, pendingBet);

    expectReferenceFailure(
      () => refund.assertValidReference(pendingBet),

      WagerFailureCode.ReferenceNotProcessed,
    );
  });

  it('should reject a reference with a different amount', () => {
    const bet = processTransaction(
      WagerTransaction.create(
        makeProps({
          externalTransactionId: 'bet-123',

          money: Money.from({
            amount: '10.00',
            currency: 'BRL',
          }),
        }),
      ),
    );

    const refund = WagerTransaction.create(
      makeProps({
        walletId: bet.walletId,

        kind: WagerTransactionKind.Refund,

        money: Money.from({
          amount: '25.00',
          currency: 'BRL',
        }),

        referenceExternalTransactionId: bet.externalTransactionId,
      }),
    );

    expectReferenceFailure(
      () => refund.assertValidReference(bet),

      WagerFailureCode.ReferenceAmountMismatch,
    );
  });
});
