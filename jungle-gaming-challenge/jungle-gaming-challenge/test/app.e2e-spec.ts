import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    process.env.SQS_WAGER_CONSUMER_ENABLED = 'false';
    process.env.OUTBOX_PUBLISHER_ENABLED = 'false';
    process.env.PENDING_REFERENCE_WORKER_ENABLED = 'false';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('/health (GET)', async () => {
    await request(app.getHttpServer()).get('/health').expect(200).expect({
      status: 'ok',
    });
  });

  it('/health/live (GET)', async () => {
    await request(app.getHttpServer()).get('/health/live').expect(200).expect({
      status: 'ok',
    });
  });

  it('/health/ready (GET)', async () => {
    await request(app.getHttpServer())
      .get('/health/ready')
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual({
          status: 'ok',
          postgres: 'up',
          sqs: 'up',
        });
      });
  });
});
