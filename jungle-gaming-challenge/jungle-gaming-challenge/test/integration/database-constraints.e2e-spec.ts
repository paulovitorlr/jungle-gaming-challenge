import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'bun:test';
import { MikroORM } from '@mikro-orm/postgresql';
import { Test, type TestingModule } from '@nestjs/testing';
import { AppModule } from '../../src/app.module.js';
import { OpenWalletUseCase } from '../../src/modules/wallet/application/use-cases/open-wallet.use-case.js';

describe('Database financial constraints', () => {
  let moduleRef: TestingModule;
  let orm: MikroORM;
  let openWallet: OpenWalletUseCase;

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

  it('enforces wallet uniqueness and non-negative balance in PostgreSQL', async () => {
    const wallet = await openWallet.execute({
      playerId: 'schema-player',
      initialBalance: { amount: '10.00', currency: 'BRL' },
    });

    await expect(
      orm.em.getConnection().execute(
        `insert into wallets
          (id, player_id, currency, balance, version, created_at, updated_at)
         values (?, ?, 'BRL', 0, 1, now(), now())`,
        ['schema-duplicate', 'schema-player'],
      ),
    ).rejects.toThrow();

    await expect(
      orm.em
        .getConnection()
        .execute(`update wallets set balance = -1 where id = ?`, [wallet.id]),
    ).rejects.toThrow();
  });

  it('prevents ledger mutation and deletion in PostgreSQL', async () => {
    const wallet = await openWallet.execute({
      playerId: 'immutable-ledger-player',
      initialBalance: { amount: '10.00', currency: 'BRL' },
    });

    const rows = await orm.em
      .getConnection()
      .execute<
        Array<{ id: string }>
      >(`select id from wallet_ledger_entries where wallet_id = ?`, [wallet.id]);
    expect(rows).toHaveLength(1);

    await expect(
      orm.em
        .getConnection()
        .execute(`update wallet_ledger_entries set amount = 9 where id = ?`, [
          rows[0]!.id,
        ]),
    ).rejects.toThrow('wallet ledger entries are immutable');

    await expect(
      orm.em
        .getConnection()
        .execute(`delete from wallet_ledger_entries where id = ?`, [
          rows[0]!.id,
        ]),
    ).rejects.toThrow('wallet ledger entries are immutable');
  });

  it('installs all challenge-critical constraints and the ledger trigger', async () => {
    const constraintRows = await orm.em.getConnection().execute<
      Array<{ constraint_name: string }>
    >(`
      select conname as constraint_name
      from pg_constraint
      where conname in (
        'wallets_balance_non_negative_check',
        'uq_wallets_player_currency',
        'wallet_ledger_balanced_check',
        'wallet_ledger_amount_positive_check',
        'uq_wager_transactions_provider_idempotency_key',
        'uq_wager_transactions_provider_external_transaction'
      )
    `);

    expect(new Set(constraintRows.map((row) => row.constraint_name))).toEqual(
      new Set([
        'wallets_balance_non_negative_check',
        'uq_wallets_player_currency',
        'wallet_ledger_balanced_check',
        'wallet_ledger_amount_positive_check',
        'uq_wager_transactions_provider_idempotency_key',
        'uq_wager_transactions_provider_external_transaction',
      ]),
    );

    const triggerRows = await orm.em.getConnection().execute<
      Array<{ trigger_name: string }>
    >(`
      select tgname as trigger_name
      from pg_trigger
      where tgname = 'wallet_ledger_entries_immutable'
        and not tgisinternal
    `);
    expect(triggerRows).toHaveLength(1);
  });
});
