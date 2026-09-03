import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { randomUUID } from 'node:crypto';

const INSTANCE_COUNT = 3;
const basePort = 32000 + Math.floor(Math.random() * 2000);
const ports = Array.from({ length: INSTANCE_COUNT }, (_, index) => basePort + index);
const processes: Bun.Subprocess[] = [];

type JsonRecord = Record<string, any>;

async function request(
  port: number,
  path: string,
  init?: RequestInit,
): Promise<{ status: number; body: JsonRecord }> {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, init);
  const body = (await response.json()) as JsonRecord;
  return { status: response.status, body };
}

async function waitUntilReady(port: number): Promise<void> {
  const deadline = Date.now() + 20_000;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health/ready`);
      if (response.ok) return;
    } catch {
      // The process may still be booting.
    }

    await Bun.sleep(150);
  }

  throw new Error(`Application process on port ${port} did not become ready`);
}

function ensureBuild(): void {
  const result = Bun.spawnSync(['bun', 'run', 'build'], {
    stdout: 'inherit',
    stderr: 'inherit',
  });

  if (result.exitCode !== 0) {
    throw new Error('Could not build application for multiprocess test');
  }
}

function startInstance(port: number): Bun.Subprocess {
  return Bun.spawn(['bun', 'dist/main.js'], {
    env: {
      ...process.env,
      APP_PORT: String(port),
      SQS_WAGER_CONSUMER_ENABLED: 'false',
      OUTBOX_PUBLISHER_ENABLED: 'false',
      PENDING_REFERENCE_WORKER_ENABLED: 'false',
    },
    stdout: 'ignore',
    stderr: 'ignore',
  });
}

async function createWallet(port: number, initialBalance = '100.00') {
  const playerId = `multiprocess-player-${randomUUID()}`;
  const result = await request(port, '/wallets', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      playerId,
      initialBalance: { amount: initialBalance, currency: 'BRL' },
    }),
  });

  expect(result.status).toBe(201);
  return { playerId, walletId: result.body.id as string };
}

function betRequest(
  port: number,
  input: { playerId: string; walletId: string; amount: string; suffix: string },
) {
  const idempotencyKey = `multiprocess:${input.suffix}:${randomUUID()}`;

  return request(port, '/wagering/transactions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': idempotencyKey,
    },
    body: JSON.stringify({
      providerId: 'multiprocess-provider',
      externalTransactionId: `bet-${input.suffix}-${randomUUID()}`,
      playerId: input.playerId,
      walletId: input.walletId,
      roundId: `round-${input.suffix}`,
      gameId: 'multiprocess-game',
      kind: 'BET',
      money: { amount: input.amount, currency: 'BRL' },
    }),
  });
}

describe('multiprocess concurrency', () => {
  beforeAll(async () => {
    ensureBuild();

    for (const port of ports) {
      processes.push(startInstance(port));
    }

    await Promise.all(ports.map(waitUntilReady));
  });

  afterAll(async () => {
    for (const process of processes) {
      process.kill('SIGTERM');
    }

    await Promise.allSettled(processes.map((process) => process.exited));
  });

  it('keeps a shared hot wallet correct across independent processes', async () => {
    const wallet = await createWallet(ports[0]!);

    const [first, second] = await Promise.all([
      betRequest(ports[1]!, {
        ...wallet,
        amount: '80.00',
        suffix: 'hot-a',
      }),
      betRequest(ports[2]!, {
        ...wallet,
        amount: '80.00',
        suffix: 'hot-b',
      }),
    ]);

    const results = [first, second];
    expect(results.filter((result) => result.body.status === 'PROCESSED')).toHaveLength(1);
    expect(results.filter((result) => result.body.status === 'REJECTED')).toHaveLength(1);

    const walletState = await request(ports[0]!, `/wallets/${wallet.walletId}`);
    expect(walletState.status).toBe(200);
    expect(walletState.body.balance.amount).toBe('20.00');

    const ledger = await request(
      ports[1]!,
      `/wallets/${wallet.walletId}/ledger?limit=100`,
    );
    expect(ledger.status).toBe(200);

    const debits = (ledger.body.items as JsonRecord[]).filter(
      (entry) => entry.direction === 'DEBIT',
    );
    expect(debits).toHaveLength(1);
    expect(debits[0]!.money.amount).toBe('80.00');
    expect(debits[0]!.balanceBefore.amount).toBe('100.00');
    expect(debits[0]!.balanceAfter.amount).toBe('20.00');

    const reconciliation = await request(
      ports[2]!,
      `/wallets/${wallet.walletId}/reconciliation`,
      { method: 'POST' },
    );
    expect(reconciliation.status).toBe(200);
    expect(reconciliation.body.consistent).toBe(true);
    expect(reconciliation.body.storedBalance.amount).toBe('20.00');
    expect(reconciliation.body.calculatedBalance.amount).toBe('20.00');
  });

  it('processes distinct wallets in parallel across the three processes', async () => {
    const wallets = await Promise.all(ports.map((port) => createWallet(port)));

    const results = await Promise.all(
      ports.map((port, index) =>
        betRequest(port, {
          ...wallets[index]!,
          amount: '25.00',
          suffix: `parallel-${index}`,
        }),
      ),
    );

    expect(results.every((result) => result.body.status === 'PROCESSED')).toBe(true);
    expect(results.every((result) => result.body.balance.amount === '75.00')).toBe(true);

    const reconciliations = await Promise.all(
      wallets.map((wallet, index) =>
        request(
          ports[(index + 1) % INSTANCE_COUNT]!,
          `/wallets/${wallet.walletId}/reconciliation`,
          { method: 'POST' },
        ),
      ),
    );

    expect(
      reconciliations.every(
        (result) =>
          result.status === 200 &&
          result.body.consistent === true &&
          result.body.storedBalance.amount === '75.00',
      ),
    ).toBe(true);
  });
});
