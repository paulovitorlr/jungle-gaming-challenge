import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PublishOutboxMessagesUseCase } from '../../application/use-cases/publish-outbox-messages.use-case.js';

@Injectable()
export class OutboxPublisherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxPublisherService.name);

  private readonly enabled: boolean;
  private readonly batchSize: number;
  private readonly leaseDurationMs: number;
  private readonly pollIntervalMs: number;

  private stopping = false;
  private publisherLoop?: Promise<void>;

  constructor(
    configService: ConfigService,
    private readonly publishOutboxMessages: PublishOutboxMessagesUseCase,
  ) {
    this.enabled =
      configService.get<string>('OUTBOX_PUBLISHER_ENABLED') !== 'false';

    this.batchSize = this.readPositiveInteger(
      configService,
      'OUTBOX_BATCH_SIZE',
      10,
    );

    this.leaseDurationMs = this.readPositiveInteger(
      configService,
      'OUTBOX_LEASE_DURATION_MS',
      60_000,
    );

    this.pollIntervalMs = this.readPositiveInteger(
      configService,
      'OUTBOX_POLL_INTERVAL_MS',
      1_000,
    );
  }

  onModuleInit(): void {
    if (!this.enabled) {
      this.logger.log(
        JSON.stringify({
          event: 'outbox_publisher_disabled',
        }),
      );

      return;
    }

    this.publisherLoop = this.publishContinuously();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    await this.publisherLoop;
  }

  private async publishContinuously(): Promise<void> {
    this.logger.log(
      JSON.stringify({
        event: 'outbox_publisher_started',
        batchSize: this.batchSize,
        pollIntervalMs: this.pollIntervalMs,
        leaseDurationMs: this.leaseDurationMs,
      }),
    );

    while (!this.stopping) {
      try {
        const result = await this.publishOutboxMessages.execute({
          batchSize: this.batchSize,
          leaseDurationMs: this.leaseDurationMs,
        });

        if (result.claimed > 0) {
          this.logger.log(
            JSON.stringify({
              event: 'outbox_batch_published',
              ...result,
            }),
          );
        }

        if (result.claimed === 0) {
          await this.delay(this.pollIntervalMs);
        }
      } catch (error) {
        if (this.stopping) {
          break;
        }

        this.logger.error(
          JSON.stringify({
            event: 'outbox_batch_failed',
            error: this.errorMessage(error),
          }),
        );

        await this.delay(this.pollIntervalMs);
      }
    }

    this.logger.log(
      JSON.stringify({
        event: 'outbox_publisher_stopped',
      }),
    );
  }

  private readPositiveInteger(
    configService: ConfigService,
    name: string,
    fallback: number,
  ): number {
    const parsed = Number(configService.get<string>(name));

    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown error';
  }

  private delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, milliseconds);
    });
  }
}
