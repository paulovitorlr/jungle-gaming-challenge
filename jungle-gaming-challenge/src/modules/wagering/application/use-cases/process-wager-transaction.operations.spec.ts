import { describe, expect, it, mock } from 'bun:test';
import { Wallet } from '../../../../shared/domain/entities/wallet.entity.js';
import { Money } from '../../../../shared/domain/value-objects/money.vo.js';
import { WalletId } from '../../../../shared/domain/value-objects/wallet-id.vo.js';
import type { UnitOfWork } from '../../../../shared/application/ports/unit-of-work.js';
import type { WalletRepository } from '../../../wallet/domain/repositories/wallet.repository.js';
import type { WalletLedgerRepository } from '../../../wallet/domain/repositories/wallet-ledger.repository.js';
import type { OutboxMessageRepository } from '../../../messaging/domain/repositories/outbox-message.repository.js';
import { WagerTransaction } from '../../domain/entities/wager-transaction.js';
import { WagerTransactionKind } from '../../domain/enums/wager-transaction-kind.enum.js';
import { WagerTransactionStatus } from '../../domain/enums/wager-transaction-status.enum.js';
import type { WagerTransactionRepository } from '../../domain/repositories/wager-transaction.repository.js';
import { ProcessWagerTransactionUseCase } from './process-wager-transaction.use-case.js';

const walletId = WalletId.from('wallet-operations');

function wallet(balance = '100.00') {
  return Wallet.rehydrate({
    id: walletId,
    playerId: 'player-operations',
    currency: 'BRL',
    balance: Money.from({ amount: balance, currency: 'BRL' }),
    version: 1,
    createdAt: new Date('2026-09-03T12:00:00.000Z'),
    updatedAt: new Date('2026-09-03T12:00:00.000Z'),
  });
}

function processedReference(kind: WagerTransactionKind) {
  const reference = WagerTransaction.create({
    providerId: 'provider-a',
    externalTransactionId: `reference-${kind}`,
    idempotencyKey: `reference-${kind}`,
    payloadHash: `hash-${kind}`,
    walletId,
    playerId: 'player-operations',
    roundId: 'round-operations',
    gameId: 'game-operations',
    kind,
    money: Money.from({ amount: '25.00', currency: 'BRL' }),
  });
  reference.markProcessed(
    undefined,
    Money.from({ amount: '100.00', currency: 'BRL' }),
    new Date(),
  );
  return reference;
}

function harness(reference: WagerTransaction | null = null) {
  const currentWallet = wallet();
  const wallets = {
    findById: mock().mockResolvedValue(currentWallet),
    findByPlayerAndCurrency: mock().mockResolvedValue(null),
    add: mock(),
    update: mock().mockResolvedValue(true),
  } as unknown as WalletRepository;
  const ledger = {
    add: mock(),
    findByWalletId: mock().mockResolvedValue([]),
  } as unknown as WalletLedgerRepository;
  const transactions = {
    findById: mock(),
    findByIdempotencyKey: mock().mockResolvedValue(null),
    findByProviderAndExternalTransactionId: mock().mockResolvedValue(reference),
    findProcessedReversal: mock().mockResolvedValue(null),
    claimPendingReferences: mock().mockResolvedValue([]),
    updateClaimedReference: mock().mockResolvedValue(true),
    save: mock(),
  } as unknown as WagerTransactionRepository;
  const outbox = {
    add: mock(),
  } as unknown as OutboxMessageRepository;
  const unitOfWork = {
    execute: mock((work: () => Promise<unknown>) => work()),
  } as unknown as UnitOfWork;

  return {
    currentWallet,
    wallets,
    ledger,
    transactions,
    outbox,
    useCase: new ProcessWagerTransactionUseCase(
      wallets,
      ledger,
      transactions,
      unitOfWork,
      outbox,
    ),
  };
}

function input(kind: WagerTransactionKind, reference?: WagerTransaction) {
  return {
    providerId: 'provider-a',
    externalTransactionId: `transaction-${kind}`,
    idempotencyKey: `provider-a:transaction-${kind}`,
    payloadHash: `payload-${kind}`,
    walletId: walletId.toString(),
    playerId: 'player-operations',
    roundId: 'round-operations',
    gameId: 'game-operations',
    kind,
    amount: '25.00',
    currency: 'BRL',
    referenceExternalTransactionId: reference?.externalTransactionId,
  };
}

describe('ProcessWagerTransactionUseCase operations', () => {
  it('credits a WIN', async () => {
    const setup = harness();
    const result = await setup.useCase.execute(input(WagerTransactionKind.Win));
    expect(result.balance).toBe('125.00');
    expect(setup.ledger.add).toHaveBeenCalledTimes(1);
  });

  it('processes LOSS without changing balance or ledger', async () => {
    const setup = harness();
    const result = await setup.useCase.execute(
      input(WagerTransactionKind.Loss),
    );
    expect(result.status).toBe(WagerTransactionStatus.Processed);
    expect(result.balance).toBe('100.00');
    expect(setup.wallets.update).not.toHaveBeenCalled();
    expect(setup.ledger.add).not.toHaveBeenCalled();
  });

  it('persists REFUND as PENDING_REFERENCE when BET has not arrived', async () => {
    const setup = harness();
    const result = await setup.useCase.execute({
      ...input(WagerTransactionKind.Refund),
      referenceExternalTransactionId: 'missing-bet',
    });
    expect(result.status).toBe(WagerTransactionStatus.PendingReference);
    expect(result.balance).toBe('100.00');
    expect(setup.ledger.add).not.toHaveBeenCalled();
  });

  it('credits a REFUND that references a processed BET', async () => {
    const reference = processedReference(WagerTransactionKind.Bet);
    const setup = harness(reference);
    const result = await setup.useCase.execute(
      input(WagerTransactionKind.Refund, reference),
    );
    expect(result.balance).toBe('125.00');
    expect(setup.ledger.add).toHaveBeenCalledTimes(1);
  });

  it('debits a ROLLBACK that references a processed WIN', async () => {
    const reference = processedReference(WagerTransactionKind.Win);
    const setup = harness(reference);
    const result = await setup.useCase.execute(
      input(WagerTransactionKind.Rollback, reference),
    );
    expect(result.balance).toBe('75.00');
    expect(setup.ledger.add).toHaveBeenCalledTimes(1);
  });
});
