import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'bun:test';
import { Test, type TestingModule } from '@nestjs/testing';
import { MikroORM } from '@mikro-orm/postgresql';
import { AppModule } from '../../src/app.module.js';
import { OpenWalletUseCase } from '../../src/modules/wallet/application/use-cases/open-wallet.use-case.js';
import { ReconcileWalletUseCase } from '../../src/modules/wallet/application/use-cases/reconcile-wallet.use-case.js';
import { ProcessWagerTransactionUseCase } from '../../src/modules/wagering/application/use-cases/process-wager-transaction.use-case.js';
import { ReprocessPendingReferencesUseCase } from '../../src/modules/wagering/application/use-cases/reprocess-pending-references.use-case.js';
import { WagerTransactionKind } from '../../src/modules/wagering/domain/enums/wager-transaction-kind.enum.js';
import { WagerTransactionStatus } from '../../src/modules/wagering/domain/enums/wager-transaction-status.enum.js';
import { WagerFailureCode } from '../../src/modules/wagering/domain/enums/wager-failure-code.enum.js';
import { WagerTransactionRepository } from '../../src/modules/wagering/domain/repositories/wager-transaction.repository.js';

describe('Complete wagering operations', () => {
  let moduleRef: TestingModule;
  let orm: MikroORM;
  let openWallet: OpenWalletUseCase;
  let processTransaction: ProcessWagerTransactionUseCase;
  let reprocessReferences: ReprocessPendingReferencesUseCase;
  let reconcile: ReconcileWalletUseCase;
  let transactions: WagerTransactionRepository;

  beforeAll(async () => {
    process.env.SQS_WAGER_CONSUMER_ENABLED = 'false';
    process.env.OUTBOX_PUBLISHER_ENABLED = 'false';
    process.env.PENDING_REFERENCE_WORKER_ENABLED = 'false';

    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    await moduleRef.init();
    orm = moduleRef.get(MikroORM);
    openWallet = moduleRef.get(OpenWalletUseCase);
    processTransaction = moduleRef.get(ProcessWagerTransactionUseCase);
    reprocessReferences = moduleRef.get(ReprocessPendingReferencesUseCase);
    reconcile = moduleRef.get(ReconcileWalletUseCase);
    transactions = moduleRef.get(WagerTransactionRepository);
  });

  beforeEach(async () => {
    await orm.em.getConnection().execute(`
      truncate table
        outbox_messages,
        inbox_messages,
        wallet_ledger_entries,
        wager_transactions,
        wallets
      cascade
    `);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('processes BET, WIN, LOSS, REFUND and ROLLBACK consistently', async () => {
    const wallet = await openWallet.execute({
      playerId: 'player-complete-flow',
      initialBalance: { amount: '100.00', currency: 'BRL' },
    });

    const bet = await execute(WagerTransactionKind.Bet, 'bet-1', wallet.id);
    expect(bet.balance).toBe('75.00');

    const win = await execute(WagerTransactionKind.Win, 'win-1', wallet.id);
    expect(win.balance).toBe('100.00');

    const loss = await execute(WagerTransactionKind.Loss, 'loss-1', wallet.id);
    expect(loss.balance).toBe('100.00');

    const refund = await execute(
      WagerTransactionKind.Refund,
      'refund-1',
      wallet.id,
      'bet-1',
    );
    expect(refund.balance).toBe('125.00');

    const rollback = await execute(
      WagerTransactionKind.Rollback,
      'rollback-1',
      wallet.id,
      'win-1',
    );
    expect(rollback.balance).toBe('100.00');

    const result = await reconcile.execute(wallet.id);
    expect(result?.consistent).toBe(true);
    expect(result?.storedBalance.amount).toBe('100.00');
    expect(result?.checkedEntries).toBe(5);
  });

  it('rejects a second processed refund for the same BET', async () => {
    const wallet = await openWallet.execute({
      playerId: 'player-duplicate-refund',
      initialBalance: { amount: '100.00', currency: 'BRL' },
    });
    await execute(WagerTransactionKind.Bet, 'bet-duplicate', wallet.id);
    await execute(
      WagerTransactionKind.Refund,
      'refund-first',
      wallet.id,
      'bet-duplicate',
    );
    const second = await execute(
      WagerTransactionKind.Refund,
      'refund-second',
      wallet.id,
      'bet-duplicate',
    );

    expect(second.status).toBe(WagerTransactionStatus.Rejected);
    expect(second.failureCode).toBe(WagerFailureCode.ReferenceAlreadyReversed);
    expect(second.balance).toBe('100.00');
  });

  it('reprocesses a REFUND that arrived before its BET', async () => {
    const wallet = await openWallet.execute({
      playerId: 'player-out-of-order',
      initialBalance: { amount: '100.00', currency: 'BRL' },
    });
    const refund = await execute(
      WagerTransactionKind.Refund,
      'refund-early',
      wallet.id,
      'bet-late',
    );
    expect(refund.status).toBe(WagerTransactionStatus.PendingReference);

    await execute(WagerTransactionKind.Bet, 'bet-late', wallet.id);
    const worker = await reprocessReferences.execute({
      now: new Date(Date.now() + 2_000),
    });
    expect(worker.processed).toBe(1);

    const persisted = await transactions.findByIdempotencyKey(
      'provider-e2e',
      'provider-e2e:refund-early',
    );
    expect(persisted?.status).toBe(WagerTransactionStatus.Processed);
    expect(persisted?.resultingBalance?.toString()).toBe('100.00');
    expect((await reconcile.execute(wallet.id))?.consistent).toBe(true);
  });

  it('rejects a pending reference with a stable code after eight attempts', async () => {
    const wallet = await openWallet.execute({
      playerId: 'player-out-of-order',
      initialBalance: { amount: '100.00', currency: 'BRL' },
    });
    const refund = await execute(
      WagerTransactionKind.Refund,
      'refund-early-never',
      wallet.id,
      'bet-that-never-arrives',
    );
    expect(refund.status).toBe(WagerTransactionStatus.PendingReference);

    let finalResult;
    for (let attempt = 1; attempt <= 8; attempt++) {
      finalResult = await reprocessReferences.execute({
        now: new Date(Date.now() + attempt * 600_000),
      });
    }

    expect(finalResult?.rejected).toBe(1);
    const persisted = await transactions.findByIdempotencyKey(
      'provider-e2e',
      'provider-e2e:refund-early-never',
    );
    expect(persisted?.status).toBe(WagerTransactionStatus.Rejected);
    expect(persisted?.failureCode).toBe(WagerFailureCode.ReferenceNotFound);
    expect((await reconcile.execute(wallet.id))?.consistent).toBe(true);
  });

  async function execute(
    kind: WagerTransactionKind,
    externalTransactionId: string,
    walletId: string,
    referenceExternalTransactionId?: string,
  ) {
    const businessPayload = {
      providerId: 'provider-e2e',
      externalTransactionId,
      walletId,
      playerId:
        externalTransactionId.includes('duplicate') ||
        externalTransactionId.includes('first') ||
        externalTransactionId.includes('second')
          ? 'player-duplicate-refund'
          : externalTransactionId.includes('early') ||
              externalTransactionId.includes('late')
            ? 'player-out-of-order'
            : 'player-complete-flow',
      roundId: 'round-e2e',
      gameId: 'game-e2e',
      kind,
      amount: '25.00',
      currency: 'BRL',
      referenceExternalTransactionId,
    };

    return processTransaction.execute({
      ...businessPayload,
      idempotencyKey: `provider-e2e:${externalTransactionId}`,
      payloadHash: JSON.stringify(businessPayload),
    });
  }
});
