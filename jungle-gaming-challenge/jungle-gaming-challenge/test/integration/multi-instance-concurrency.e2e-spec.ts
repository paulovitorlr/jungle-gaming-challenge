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
import { WagerTransactionKind } from '../../src/modules/wagering/domain/enums/wager-transaction-kind.enum.js';

describe('Three application instances', () => {
  const modules: TestingModule[] = [];

  beforeAll(async () => {
    process.env.SQS_WAGER_CONSUMER_ENABLED = 'false';
    process.env.OUTBOX_PUBLISHER_ENABLED = 'false';
    process.env.PENDING_REFERENCE_WORKER_ENABLED = 'false';

    for (let index = 0; index < 3; index++) {
      const moduleRef = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      await moduleRef.init();
      modules.push(moduleRef);
    }
  });

  beforeEach(async () => {
    await modules[0]!.get(MikroORM).em.getConnection().execute(`
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
    await Promise.all(modules.map((moduleRef) => moduleRef.close()));
  });

  it('keeps one hot wallet correct across three instances', async () => {
    const wallet = await modules[0]!.get(OpenWalletUseCase).execute({
      playerId: 'player-three-instances',
      initialBalance: { amount: '100.00', currency: 'BRL' },
    });

    const results = await Promise.all(
      modules.map((moduleRef, index) =>
        moduleRef.get(ProcessWagerTransactionUseCase).execute({
          providerId: 'provider-three-instances',
          externalTransactionId: `bet-${index}`,
          idempotencyKey: `provider-three-instances:bet-${index}`,
          payloadHash: `hash-${index}`,
          walletId: wallet.id,
          playerId: wallet.playerId,
          roundId: `round-${index}`,
          gameId: 'game-three-instances',
          kind: WagerTransactionKind.Bet,
          amount: '40.00',
          currency: 'BRL',
        }),
      ),
    );

    expect(
      results.filter((result) => result.status === 'PROCESSED'),
    ).toHaveLength(2);
    expect(
      results.filter((result) => result.status === 'REJECTED'),
    ).toHaveLength(1);

    const reconciliation = await modules[0]!
      .get(ReconcileWalletUseCase)
      .execute(wallet.id);
    expect(reconciliation?.storedBalance.amount).toBe('20.00');
    expect(reconciliation?.consistent).toBe(true);
  });

  it('processes different wallets in parallel', async () => {
    const wallets = await Promise.all(
      modules.map((moduleRef, index) =>
        moduleRef.get(OpenWalletUseCase).execute({
          playerId: `parallel-player-${index}`,
          initialBalance: { amount: '100.00', currency: 'BRL' },
        }),
      ),
    );

    const results = await Promise.all(
      modules.map((moduleRef, index) =>
        moduleRef.get(ProcessWagerTransactionUseCase).execute({
          providerId: 'provider-parallel-wallets',
          externalTransactionId: `parallel-bet-${index}`,
          idempotencyKey: `provider-parallel-wallets:parallel-bet-${index}`,
          payloadHash: `parallel-hash-${index}`,
          walletId: wallets[index]!.id,
          playerId: wallets[index]!.playerId,
          roundId: `parallel-round-${index}`,
          gameId: 'game-parallel-wallets',
          kind: WagerTransactionKind.Bet,
          amount: '25.00',
          currency: 'BRL',
        }),
      ),
    );

    expect(results.every((result) => result.status === 'PROCESSED')).toBe(true);
    expect(results.every((result) => result.balance === '75.00')).toBe(true);
  });
});
