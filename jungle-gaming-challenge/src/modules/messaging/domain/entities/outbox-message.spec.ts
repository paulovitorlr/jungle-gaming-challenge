import {
  IntegrationEvent,
  type IntegrationEventProps,
} from '../../../../shared/domain/events/integration-event.js';

import { OutboxMessage } from './outbox-message.js';

type TestEventData = {
  transactionId: string;
};

class TestIntegrationEvent
  extends IntegrationEvent<TestEventData>
{
  readonly eventType = 'TestEvent';
  readonly version = 1;

  private constructor(
    props:
      IntegrationEventProps<TestEventData>,
  ) {
    super(props);
  }

  static create(): TestIntegrationEvent {
    return new TestIntegrationEvent({
      eventId: 'event-123',
      aggregateId: 'transaction-123',
      correlationId: 'correlation-123',
      causationId: 'message-123',
      occurredAt:
        new Date(
          '2026-09-02T18:00:00.000Z',
        ),
      data: {
        transactionId:
          'transaction-123',
      },
    });
  }
}

describe('OutboxMessage', () => {
  it('should enqueue an integration event', () => {
    const event =
      TestIntegrationEvent.create();

    const message =
      OutboxMessage.enqueue(event);

    expect(message.id).toBe('event-123');

    expect(message.aggregateId).toBe(
      'transaction-123',
    );

    expect(message.eventType).toBe(
      'TestEvent',
    );

    expect(message.attempts).toBe(0);
    expect(message.nextAttemptAt).toBeUndefined();
    expect(message.publishedAt).toBeUndefined();
    expect(message.isPending()).toBe(true);

    expect(message.payload).toEqual(
      event.toJSON(),
    );
  });

  it('should initially be due', () => {
    const message = OutboxMessage.enqueue(
      TestIntegrationEvent.create(),
    );

    expect(
      message.isDue(
        new Date(
          '2026-09-02T18:00:00.000Z',
        ),
      ),
    ).toBe(true);
  });

  it('should schedule retries with exponential backoff', () => {
    const message = OutboxMessage.enqueue(
      TestIntegrationEvent.create(),
    );

    const firstAttempt =
      new Date(
        '2026-09-02T18:01:00.000Z',
      );

    message.scheduleRetry(firstAttempt);

    expect(message.attempts).toBe(1);

    expect(
      message.nextAttemptAt,
    ).toEqual(
      new Date(
        '2026-09-02T18:01:01.000Z',
      ),
    );

    expect(
      message.isDue(firstAttempt),
    ).toBe(false);

    const secondAttempt =
      message.nextAttemptAt!;

    message.scheduleRetry(secondAttempt);

    expect(message.attempts).toBe(2);

    expect(
      message.nextAttemptAt,
    ).toEqual(
      new Date(
        '2026-09-02T18:01:03.000Z',
      ),
    );
  });

  it('should mark the message as published', () => {
    const message = OutboxMessage.enqueue(
      TestIntegrationEvent.create(),
    );

    const publishedAt =
      new Date(
        '2026-09-02T18:02:00.000Z',
      );

    message.markPublished(publishedAt);

    expect(message.isPending()).toBe(false);

    expect(message.publishedAt).toEqual(
      publishedAt,
    );

    expect(message.nextAttemptAt).toBeUndefined();

    expect(
      message.isDue(
        new Date(
          '2026-09-02T18:03:00.000Z',
        ),
      ),
    ).toBe(false);
  });

  it('should not publish the same message twice', () => {
    const message = OutboxMessage.enqueue(
      TestIntegrationEvent.create(),
    );

    message.markPublished(
      new Date(
        '2026-09-02T18:02:00.000Z',
      ),
    );

    expect(() =>
      message.markPublished(
        new Date(
          '2026-09-02T18:03:00.000Z',
        ),
      ),
    ).toThrow(
      'Outbox message is already published',
    );
  });

  it('should not retry a published message', () => {
    const message = OutboxMessage.enqueue(
      TestIntegrationEvent.create(),
    );

    message.markPublished(
      new Date(
        '2026-09-02T18:02:00.000Z',
      ),
    );

    expect(() =>
      message.scheduleRetry(
        new Date(
          '2026-09-02T18:03:00.000Z',
        ),
      ),
    ).toThrow(
      'Published outbox message cannot be retried',
    );
  });

  it('should rehydrate persisted state', () => {
    const nextAttemptAt =
      new Date(
        '2026-09-02T18:01:01.000Z',
      );

    const message =
      OutboxMessage.rehydrate({
        id: 'event-123',
        aggregateId:
          'transaction-123',
        eventType: 'TestEvent',
        payload: {
          eventId: 'event-123',
        },
        occurredAt:
          new Date(
            '2026-09-02T18:00:00.000Z',
          ),
        attempts: 1,
        nextAttemptAt,
      });

    expect(message.attempts).toBe(1);

    expect(
      message.nextAttemptAt,
    ).toEqual(nextAttemptAt);

    expect(message.isPending()).toBe(true);
  });
});