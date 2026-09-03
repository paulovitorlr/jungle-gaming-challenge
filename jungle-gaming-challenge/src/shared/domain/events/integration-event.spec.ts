import {
  IntegrationEvent,
  type IntegrationEventProps,
} from './integration-event.js';

type TestEventData = {
  value: string;
};

class TestIntegrationEvent extends IntegrationEvent<TestEventData> {
  readonly eventType = 'TestIntegrationEvent';

  readonly version = 1;

  private constructor(props: IntegrationEventProps<TestEventData>) {
    super(props);
  }

  static create(
    props: IntegrationEventProps<TestEventData>,
  ): TestIntegrationEvent {
    return new TestIntegrationEvent(props);
  }
}

describe('IntegrationEvent', () => {
  const occurredAt = new Date('2026-09-02T18:00:00.000Z');

  it('should create an integration event', () => {
    const event = TestIntegrationEvent.create({
      eventId: 'event-123',
      aggregateId: 'aggregate-123',
      correlationId: 'correlation-123',
      causationId: 'message-123',
      occurredAt,
      data: {
        value: 'test-value',
      },
    });

    expect(event.eventId).toBe('event-123');

    expect(event.eventType).toBe('TestIntegrationEvent');

    expect(event.version).toBe(1);

    expect(event.aggregateId).toBe('aggregate-123');

    expect(event.correlationId).toBe('correlation-123');

    expect(event.causationId).toBe('message-123');

    expect(event.data).toEqual({
      value: 'test-value',
    });
  });

  it('should serialize a stable event envelope', () => {
    const event = TestIntegrationEvent.create({
      eventId: 'event-123',
      aggregateId: 'aggregate-123',
      correlationId: 'correlation-123',
      causationId: 'message-123',
      occurredAt,
      data: {
        value: 'test-value',
      },
    });

    expect(event.toJSON()).toEqual({
      eventId: 'event-123',
      eventType: 'TestIntegrationEvent',
      aggregateId: 'aggregate-123',
      correlationId: 'correlation-123',
      causationId: 'message-123',
      occurredAt: '2026-09-02T18:00:00.000Z',
      version: 1,
      data: {
        value: 'test-value',
      },
    });
  });

  it('should expose immutable event data', () => {
    const event = TestIntegrationEvent.create({
      eventId: 'event-123',
      aggregateId: 'aggregate-123',
      correlationId: 'correlation-123',
      occurredAt,
      data: {
        value: 'test-value',
      },
    });

    expect(Object.isFrozen(event.data)).toBe(true);
  });

  it.each([
    ['eventId', { eventId: '' }],
    ['aggregateId', { aggregateId: ' ' }],
    ['correlationId', { correlationId: '' }],
  ])('should reject an empty %s', (_, invalidProps) => {
    expect(() =>
      TestIntegrationEvent.create({
        eventId: 'event-123',
        aggregateId: 'aggregate-123',
        correlationId: 'correlation-123',
        occurredAt,
        data: {
          value: 'test-value',
        },
        ...invalidProps,
      }),
    ).toThrow();
  });

  it('should reject an invalid occurrence date', () => {
    expect(() =>
      TestIntegrationEvent.create({
        eventId: 'event-123',
        aggregateId: 'aggregate-123',
        correlationId: 'correlation-123',
        occurredAt: new Date('invalid'),
        data: {
          value: 'test-value',
        },
      }),
    ).toThrow('Occurred at must be a valid date');
  });
});
