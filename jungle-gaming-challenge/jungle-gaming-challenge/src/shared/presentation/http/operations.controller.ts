import {
  Controller,
  Get,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MikroORM } from '@mikro-orm/postgresql';
import { GetQueueUrlCommand } from '@aws-sdk/client-sqs';
import type { Response } from 'express';
import { SqsClientService } from '../../../modules/messaging/infrastructure/sqs/sqs-client.service.js';
import { MetricsService } from '../../infrastructure/observability/metrics.service.js';

@Controller()
export class OperationsController {
  constructor(
    private readonly orm: MikroORM,
    private readonly sqs: SqsClientService,
    private readonly config: ConfigService,
    private readonly metrics: MetricsService,
  ) {}

  @Get('health/ready')
  async ready() {
    try {
      await this.orm.em.getConnection().execute('select 1');
      await Promise.all([
        this.checkQueue(this.config.getOrThrow<string>('SQS_WAGER_QUEUE_NAME')),
        this.checkQueue(
          this.config.getOrThrow<string>('SQS_EVENTS_QUEUE_NAME'),
        ),
      ]);
      return { status: 'ok', postgres: 'up', sqs: 'up' };
    } catch {
      throw new ServiceUnavailableException({
        status: 'unavailable',
        postgresOrSqs: 'down',
      });
    }
  }

  @Get('metrics')
  metricsEndpoint(@Res() response: Response): void {
    response.type('text/plain').send(this.metrics.render());
  }

  private async checkQueue(name: string): Promise<void> {
    const result = await this.sqs.client.send(
      new GetQueueUrlCommand({ QueueName: name }),
    );
    if (!result.QueueUrl) throw new Error(`Queue ${name} not found`);
  }
}
