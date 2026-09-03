import { OutboxMessage } from '../../domain/entities/outbox-message.js';
import { OutboxMessageRepository } from '../../domain/repositories/outbox-message.repository.js';
import { IntegrationEventPublisher } from '../ports/integration-event-publisher.js';
import { PublishOutboxMessagesUseCase } from './publish-outbox-messages.use-case.js';

function createMessage(): OutboxMessage {
  return OutboxMessage.rehydrate({
    id: 'event-123',
    aggregateId: 'transaction-123',
    eventType: 'WagerTransactionProcessed',
    payload: {
      eventId: 'event-123',
      eventType: 'WagerTransactionProcessed',
    },
    occurredAt: new Date('2026-09-03T12:00:00.000Z'),
    attempts: 0,
  });
}

function createDependencies(message?: OutboxMessage): {
  repository: OutboxMessageRepository;
  publisher: IntegrationEventPublisher;
} {
  return {
    repository: {
      add: vi.fn(),
      claimDueForPublishing: vi
        .fn()
        .mockResolvedValue(message ? [message] : []),
      updateClaimed: vi.fn().mockResolvedValue(true),
    } as unknown as OutboxMessageRepository,

    publisher: {
      publish: vi.fn().mockResolvedValue(undefined),
    } as unknown as IntegrationEventPublisher,
  };
}

describe('PublishOutboxMessagesUseCase', () => {
  const now = new Date('2026-09-03T12:01:00.000Z');
  it('should claim, publish and complete an outbox message', async () => {
    const message = createMessage();
    const { repository, publisher } = createDependencies(message);
    const useCase = new PublishOutboxMessagesUseCase(repository, publisher);
    

    const result = await useCase.execute({
      now,
      batchSize: 5,
      leaseDurationMs: 30_000,
    });

    expect(result).toEqual({
      claimed: 1,
      published: 1,
      failed: 0,
    });

    expect(repository.claimDueForPublishing).toHaveBeenCalledWith(
      expect.objectContaining({
        now,
        limit: 5,
        lockedUntil: new Date('2026-09-03T12:01:30.000Z'),
        lockId: expect.any(String),
      }),
    );

    expect(publisher.publish).toHaveBeenCalledWith(message);
    expect(message.publishedAt).toBeInstanceOf(Date);
    expect(repository.updateClaimed).toHaveBeenCalledWith(
      message,
      expect.any(String),
    );
  });

  it('should schedule a retry when the broker rejects the publication', async () => {
    const message = createMessage();
    const { repository, publisher } = createDependencies(message);

    vi.mocked(publisher.publish).mockRejectedValue(
      new Error('SQS unavailable'),
    );

    const useCase = new PublishOutboxMessagesUseCase(repository, publisher);

    const result = await useCase.execute({ now });

    expect(result).toEqual({
      claimed: 1,
      published: 0,
      failed: 1,
    });
    expect(message.attempts).toBe(1);
    expect(message.nextAttemptAt).toBeInstanceOf(Date);
    expect(message.publishedAt).toBeUndefined();
    expect(repository.updateClaimed).toHaveBeenCalled();
  });

  it('should report a lost lease after the broker accepted the message', async () => {
    const message = createMessage();
    const { repository, publisher } = createDependencies(message);

    vi.mocked(repository.updateClaimed).mockResolvedValue(false);

    const useCase = new PublishOutboxMessagesUseCase(repository, publisher);

    const result = await useCase.execute({ now });

    expect(result).toEqual({
      claimed: 1,
      published: 0,
      failed: 1,
    });
  });

  it('should do nothing when no message is due', async () => {
    const { repository, publisher } = createDependencies();
    const useCase = new PublishOutboxMessagesUseCase(repository, publisher);

    const result = await useCase.execute({ now });

    expect(result).toEqual({
      claimed: 0,
      published: 0,
      failed: 0,
    });
    expect(publisher.publish).not.toHaveBeenCalled();
  });
});
