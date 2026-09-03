import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'bun:test';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { MikroORM } from '@mikro-orm/postgresql';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';

describe('HTTP API', () => {
  let moduleRef: TestingModule;
  let app: INestApplication;
  let orm: MikroORM;

  beforeAll(async () => {
    process.env.SQS_WAGER_CONSUMER_ENABLED = 'false';
    process.env.OUTBOX_PUBLISHER_ENABLED = 'false';
    process.env.PENDING_REFERENCE_WORKER_ENABLED = 'false';
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    orm = moduleRef.get(MikroORM);
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
    await app.close();
  });

  it('creates, processes, queries and reconciles through HTTP', async () => {
    const walletResponse = await request(app.getHttpServer())
      .post('/wallets')
      .send({
        playerId: 'player-http',
        initialBalance: { amount: '100.00', currency: 'BRL' },
      })
      .expect(201);

    const walletId = walletResponse.body.id as string;
    expect(walletResponse.body.version).toBe(1);

    const betBody = {
      providerId: 'provider-http',
      externalTransactionId: 'bet-http',
      playerId: 'player-http',
      walletId,
      roundId: 'round-http',
      gameId: 'game-http',
      kind: 'BET',
      money: { amount: '25.00', currency: 'BRL' },
    };

    const bet = await request(app.getHttpServer())
      .post('/wagering/transactions')
      .set('Idempotency-Key', 'provider-http:bet-http')
      .send(betBody)
      .expect(201);
    expect(bet.body.balance.amount).toBe('75.00');

    await request(app.getHttpServer())
      .post('/wagering/transactions')
      .set('Idempotency-Key', 'provider-http:win-http')
      .send({
        ...betBody,
        externalTransactionId: 'win-http',
        kind: 'WIN',
        money: { amount: '10.00', currency: 'BRL' },
      })
      .expect(201);

    const replay = await request(app.getHttpServer())
      .post('/wagering/transactions')
      .set('Idempotency-Key', 'provider-http:bet-http')
      .send(betBody)
      .expect(200);
    expect(replay.body.idempotentReplay).toBe(true);
    expect(replay.body.balance.amount).toBe('75.00');

    await request(app.getHttpServer())
      .get(`/wallets/${walletId}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.balance.amount).toBe('85.00');
      });

    await request(app.getHttpServer())
      .get(`/wallets/${walletId}/ledger?limit=2`)
      .expect(200)
      .expect((response) => {
        expect(response.body.items).toHaveLength(2);
        expect(typeof response.body.nextCursor).toBe('string');
      });

    await request(app.getHttpServer())
      .get('/providers/provider-http/wagering/transactions/bet-http')
      .expect(200);

    await request(app.getHttpServer())
      .post(`/wallets/${walletId}/reconciliation`)
      .expect(200)
      .expect((response) => {
        expect(response.body.consistent).toBe(true);
        expect(response.body.calculatedBalance.amount).toBe('85.00');
      });
  });

  it('rejects a reused idempotency key with another payload', async () => {
    const wallet = await request(app.getHttpServer())
      .post('/wallets')
      .send({
        playerId: 'player-http-conflict',
        initialBalance: { amount: '100.00', currency: 'BRL' },
      });

    const base = {
      providerId: 'provider-http',
      externalTransactionId: 'bet-conflict',
      playerId: 'player-http-conflict',
      walletId: wallet.body.id,
      roundId: 'round-http',
      gameId: 'game-http',
      kind: 'BET',
    };

    await request(app.getHttpServer())
      .post('/wagering/transactions')
      .set('Idempotency-Key', 'provider-http:conflict')
      .send({ ...base, money: { amount: '10.00', currency: 'BRL' } })
      .expect(201);

    await request(app.getHttpServer())
      .post('/wagering/transactions')
      .set('Idempotency-Key', 'provider-http:conflict')
      .send({ ...base, money: { amount: '20.00', currency: 'BRL' } })
      .expect(409);
  });
});
