import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { OutboxMessageRepository } from '../../domain/repositories/outbox-message.repository.js';
import { IntegrationEventPublisher } from '../ports/integration-event-publisher.js';

export type PublishOutboxMessagesOptions = {
  now?: Date;
  batchSize?: number;
  leaseDurationMs?: number;
};

export type PublishOutboxMessagesResult = {
  claimed: number;
  published: number;
  failed: number;
};

const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_LEASE_DURATION_MS = 60_000;

@Injectable()
export class PublishOutboxMessagesUseCase {
  constructor(
    private readonly outboxRepository: OutboxMessageRepository,
    private readonly eventPublisher: IntegrationEventPublisher,
  ) {}

  async execute(
    options: PublishOutboxMessagesOptions = {},
  ): Promise<PublishOutboxMessagesResult> {
    const now = options.now ?? new Date();
    const batchSize = this.positiveInteger(
      options.batchSize,
      DEFAULT_BATCH_SIZE,
    );
    const leaseDurationMs = this.positiveInteger(
      options.leaseDurationMs,
      DEFAULT_LEASE_DURATION_MS,
    );
    const lockId = randomUUID();

    const messages = await this.outboxRepository.claimDueForPublishing({
      now,
      limit: batchSize,
      lockId,
      lockedUntil: new Date(now.getTime() + leaseDurationMs),
    });

    const result: PublishOutboxMessagesResult = {
      claimed: messages.length,
      published: 0,
      failed: 0,
    };

    for (const message of messages) {
      try {
        await this.eventPublisher.publish(message);
      } catch {
        message.scheduleRetry(now);

        await this.outboxRepository.updateClaimed(message, lockId);

        result.failed += 1;
        continue;
      }

      message.markPublished(now);

      const updated = await this.outboxRepository.updateClaimed(
        message,
        lockId,
      );

      if (updated) {
        result.published += 1;
      } else {
        /*
         * A mensagem chegou ao broker, mas o lease foi
         * perdido antes da confirmação no banco. Ela poderá
         * ser publicada novamente; consumidores devem usar
         * eventId + Inbox para deduplicação.
         */
        result.failed += 1;
      }
    }

    return result;
  }

  private positiveInteger(value: number | undefined, fallback: number): number {
    if (value === undefined || !Number.isFinite(value) || value <= 0) {
      return fallback;
    }

    return Math.trunc(value);
  }
}
