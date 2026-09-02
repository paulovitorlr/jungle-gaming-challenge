import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import {
  DeleteMessageCommand,
  GetQueueUrlCommand,
  type Message,
  ReceiveMessageCommand,
} from '@aws-sdk/client-sqs';

import type { WagerTransactionRequestedMessage } from '../../application/contracts/wager-transaction-requested.message.js';

import { ProcessWagerMessageUseCase } from '../../application/use-cases/process-wager-message.use-case.js';

import { SqsClientService } from './sqs-client.service.js';

@Injectable()
export class SqsWagerConsumerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(
    SqsWagerConsumerService.name,
  );

  private readonly queueName: string;

  private stopping = false;
  private consumerLoop?: Promise<void>;

  constructor(
    configService: ConfigService,
    private readonly sqsClient:
      SqsClientService,
    private readonly processWagerMessage:
      ProcessWagerMessageUseCase,
  ) {
    this.queueName =
      configService.getOrThrow<string>(
        'SQS_WAGER_QUEUE_NAME',
      );
  }

  onModuleInit(): void {
    this.consumerLoop = this.consume();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;

    await this.consumerLoop;
  }

  private async consume(): Promise<void> {
    const queueUrl =
      await this.resolveQueueUrl();

    this.logger.log(
      JSON.stringify({
        event: 'sqs_consumer_started',
        queueName: this.queueName,
      }),
    );

    while (!this.stopping) {
      try {
        const response =
          await this.sqsClient.client.send(
            new ReceiveMessageCommand({
              QueueUrl: queueUrl,
              MaxNumberOfMessages: 10,
              WaitTimeSeconds: 20,
              MessageSystemAttributeNames: [
                'ApproximateReceiveCount',
              ],
            }),
          );

        for (
          const message of
          response.Messages ?? []
        ) {
          await this.processMessage(
            queueUrl,
            message,
          );
        }
      } catch (error) {
        if (this.stopping) {
          break;
        }

        this.logger.error(
          JSON.stringify({
            event: 'sqs_receive_failed',
            error: this.errorMessage(error),
          }),
        );

        await this.delay(1_000);
      }
    }

    this.logger.log(
      JSON.stringify({
        event: 'sqs_consumer_stopped',
        queueName: this.queueName,
      }),
    );
  }

  private async processMessage(
    queueUrl: string,
    sqsMessage: Message,
  ): Promise<void> {
    try {
      if (
        !sqsMessage.Body ||
        !sqsMessage.ReceiptHandle
      ) {
        throw new Error(
          'SQS message is missing body or receipt handle',
        );
      }

      const message = this.parseMessage(
        sqsMessage.Body,
      );

      const result =
        await this.processWagerMessage.execute(
          message,
        );

      await this.sqsClient.client.send(
        new DeleteMessageCommand({
          QueueUrl: queueUrl,
          ReceiptHandle:
            sqsMessage.ReceiptHandle,
        }),
      );

      this.logger.log(
        JSON.stringify({
          event: 'sqs_message_processed',
          messageId: message.messageId,
          transactionId:
            result.wager?.transactionId,
          duplicate:
            result.duplicateMessage,
          providerId:
            message.data.providerId,
          walletId:
            message.data.walletId,
        }),
      );
    } catch (error) {
      /*
       * Não deletamos a mensagem.
       * Após o VisibilityTimeout, a SQS a entrega
       * novamente. Depois de três recebimentos,
       * a RedrivePolicy a move para a DLQ.
       */
      this.logger.error(
        JSON.stringify({
          event: 'sqs_message_failed',
          sqsMessageId:
            sqsMessage.MessageId,
          receiveCount:
            sqsMessage.Attributes
              ?.ApproximateReceiveCount,
          error: this.errorMessage(error),
        }),
      );
    }
  }

  private async resolveQueueUrl(): Promise<string> {
    const response =
      await this.sqsClient.client.send(
        new GetQueueUrlCommand({
          QueueName: this.queueName,
        }),
      );

    if (!response.QueueUrl) {
      throw new Error(
        `SQS queue ${this.queueName} was not found`,
      );
    }

    return response.QueueUrl;
  }

  private parseMessage(
    body: string,
  ): WagerTransactionRequestedMessage {
    const parsed: unknown = JSON.parse(body);

    if (
      !this.isRecord(parsed) ||
      typeof parsed.messageId !== 'string' ||
      parsed.messageId.trim().length === 0 ||
      parsed.type !==
        'WagerTransactionRequested' ||
      typeof parsed.occurredAt !== 'string' ||
      !this.isRecord(parsed.data)
    ) {
      throw new Error(
        'Invalid WagerTransactionRequested message',
      );
    }

    return parsed as unknown as
      WagerTransactionRequestedMessage;
  }

  private isRecord(
    value: unknown,
  ): value is Record<string, unknown> {
    return (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value)
    );
  }

  private errorMessage(
    error: unknown,
  ): string {
    return error instanceof Error
      ? error.message
      : 'Unknown error';
  }

  private delay(
    milliseconds: number,
  ): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, milliseconds);
    });
  }
}