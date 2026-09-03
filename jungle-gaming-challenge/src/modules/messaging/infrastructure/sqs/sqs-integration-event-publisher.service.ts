import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { GetQueueUrlCommand, SendMessageCommand } from '@aws-sdk/client-sqs';

import { IntegrationEventPublisher } from '../../application/ports/integration-event-publisher.js';
import { OutboxMessage } from '../../domain/entities/outbox-message.js';
import { SqsClientService } from './sqs-client.service.js';

@Injectable()
export class SqsIntegrationEventPublisherService implements IntegrationEventPublisher {
  private readonly queueName: string;
  private queueUrl?: string;

  constructor(
    configService: ConfigService,
    private readonly sqsClient: SqsClientService,
  ) {
    this.queueName =
      configService.get<string>('SQS_EVENTS_QUEUE_NAME') ??
      'integration-events';
  }

  async publish(message: OutboxMessage): Promise<void> {
    const queueUrl = await this.getQueueUrl();

    await this.sqsClient.client.send(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(message.payload),
        MessageAttributes: {
          eventId: {
            DataType: 'String',
            StringValue: message.id,
          },
          eventType: {
            DataType: 'String',
            StringValue: message.eventType,
          },
          aggregateId: {
            DataType: 'String',
            StringValue: message.aggregateId,
          },
        },
      }),
    );
  }

  private async getQueueUrl(): Promise<string> {
    if (this.queueUrl) {
      return this.queueUrl;
    }

    const response = await this.sqsClient.client.send(
      new GetQueueUrlCommand({
        QueueName: this.queueName,
      }),
    );

    if (!response.QueueUrl) {
      throw new Error(`SQS queue ${this.queueName} was not found`);
    }

    this.queueUrl = response.QueueUrl;

    return this.queueUrl;
  }
}
