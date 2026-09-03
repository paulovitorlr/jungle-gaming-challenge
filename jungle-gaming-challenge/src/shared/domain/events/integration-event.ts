export type IntegrationEventProps<
  T extends object,
> = {
  eventId: string;
  aggregateId: string;
  correlationId: string;
  causationId?: string;
  occurredAt: Date;
  data: T;
};

export type IntegrationEventEnvelope<
  T extends object,
> = {
  eventId: string;
  eventType: string;
  aggregateId: string;
  correlationId: string;
  causationId?: string;
  occurredAt: string;
  version: number;
  data: Readonly<T>;
};

export abstract class IntegrationEvent<
  T extends object,
> {
  abstract readonly eventType: string;
  abstract readonly version: number;

  readonly eventId: string;
  readonly aggregateId: string;
  readonly correlationId: string;
  readonly causationId?: string;
  readonly occurredAt: Date;
  readonly data: Readonly<T>;

  protected constructor(
    props: IntegrationEventProps<T>,
  ) {
    IntegrationEvent.assertRequired(
      props.eventId,
      'Event id is required',
    );

    IntegrationEvent.assertRequired(
      props.aggregateId,
      'Aggregate id is required',
    );

    IntegrationEvent.assertRequired(
      props.correlationId,
      'Correlation id is required',
    );

    if (
      Number.isNaN(
        props.occurredAt.getTime(),
      )
    ) {
      throw new Error(
        'Occurred at must be a valid date',
      );
    }

    this.eventId = props.eventId;
    this.aggregateId = props.aggregateId;
    this.correlationId =
      props.correlationId;
    this.causationId = props.causationId;
    this.occurredAt = new Date(
      props.occurredAt,
    );

    this.data = Object.freeze({
      ...props.data,
    }) as Readonly<T>;
  }

  toJSON(): IntegrationEventEnvelope<T> {
    return {
      eventId: this.eventId,
      eventType: this.eventType,
      aggregateId: this.aggregateId,
      correlationId: this.correlationId,
      causationId: this.causationId,
      occurredAt:
        this.occurredAt.toISOString(),
      version: this.version,
      data: this.data,
    };
  }

  private static assertRequired(
    value: string,
    message: string,
  ): void {
    if (!value || value.trim().length === 0) {
      throw new Error(message);
    }
  }
}