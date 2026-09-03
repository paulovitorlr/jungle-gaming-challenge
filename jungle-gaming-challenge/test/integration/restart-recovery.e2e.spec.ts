import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { MikroORM } from '@mikro-orm/postgresql';
import { Test, type TestingModule } from '@nestjs/testing';
import { AppModule } from '../../src/app.module.js';
import { ProcessWagerMessageUseCase } from '../../src/modules/messaging/application/use-cases/process-wager-message.use-case.js';
import { WagerTransactionKind } from '../../src/modules/wagering/domain/enums/wager-transaction-kind.enum.js';
import { OpenWalletUseCase } from '../../src/modules/wallet/application/use-cases/open-wallet.use-case.js';
import { ReconcileWalletUseCase } from '../../src/modules/wallet/application/use-cases/reconcile-wallet.use-case.js';

describe('Restart recovery after commit and before ack', () => {
  let activeModule: TestingModule | undefined;

  beforeAll(() => {
    process.env.SQS_WAGER_CONSUMER_ENABLED = 'false';
    process.env.OUTBOX_PUBLISHER_ENABLED = 'false';
    process.env.PENDING_REFERENCE_WORKER_ENABLED = 'false';
  });

  afterAll(async () => {
    await activeModule?.close();
  });

  it('uses the persisted Inbox after a new application instance starts', async () => {
    activeModule = await createModule();
    const orm = activeModule.get(MikroORM);
    await orm.em.getConnection().execute(`
      truncate table
        outbox_messages,
        inbox_messages,
        wallet_ledger_entries,
        wager_transactions,
        wallets
      cascade
    `);

    const wallet = await activeModule.get(OpenWalletUseCase).execute({
      playerId: 'restart-player',
      initialBalance: { amount: '100.00', currency: 'BRL' },
    });
    const message = {
      messageId: 'restart-message',
      type: 'WagerTransactionRequested' as const,
      occurredAt: new Date().toISOString(),
      data: {
        providerId: 'restart-provider',
        externalTransactionId: 'restart-bet',
        idempotencyKey: 'restart-provider:restart-bet',
        playerId: 'restart-player',
        walletId: wallet.id,
        roundId: 'restart-round',
        gameId: 'restart-game',
        kind: WagerTransactionKind.Bet,
        money: { amount: '25.00', currency: 'BRL' },
      },
    };

    const first = await activeModule
      .get(ProcessWagerMessageUseCase)
      .execute(message);
    expect(first.duplicateMessage).toBe(false);

    // Simula morte após o commit: nenhuma confirmação ao broker é executada.
    await activeModule.close();
    activeModule = await createModule();

    const redelivery = await activeModule
      .get(ProcessWagerMessageUseCase)
      .execute(message);
    expect(redelivery.duplicateMessage).toBe(true);

    const reconciliation = await activeModule
      .get(ReconcileWalletUseCase)
      .execute(wallet.id);
    expect(reconciliation?.storedBalance.amount).toBe('75.00');
    expect(reconciliation?.checkedEntries).toBe(2);
    expect(reconciliation?.consistent).toBe(true);
  });
});

async function createModule(): Promise<TestingModule> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  await moduleRef.init();
  return moduleRef;
}
