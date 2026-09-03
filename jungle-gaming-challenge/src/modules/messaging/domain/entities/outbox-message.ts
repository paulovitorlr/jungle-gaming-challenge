import type { IntegrationEvent } from '../../../../shared/domain/events/integration-event.js';

const INITIAL_RETRY_DELAY_MS = 1_000;
const MAX_RETRY_DELAY_MS = 300_000;

export type OutboxMessageState = {
  id: string;
  aggregateId: string;
  eventType: string;
  payload: Readonly<
    Record<string, unknown>
  >;
  occurredAt: Date;
  attempts: number;
  nextAttemptAt?: Date;
  publishedAt?: Date;
};

export class OutboxMessage {
  private constructor(
    public readonly id: string,
    public readonly aggregateId: string,
    public readonly eventType: string,
    public readonly payload: Readonly<
      Record<string, unknown>
    >,
    public readonly occurredAt: Date,
    private _attempts: number,
    private _nextAttemptAt?: Date,
    private _publishedAt?: Date,
  ) {}

  static enqueue<T extends object>(
    event: IntegrationEvent<T>,
  ): OutboxMessage {
    return new OutboxMessage(
      event.eventId,
      event.aggregateId,
      event.eventType,
      Object.freeze({
        ...event.toJSON(),
      }),
      new Date(event.occurredAt),
      0,
    );
  }

  static rehydrate(
    state: OutboxMessageState,
  ): OutboxMessage {
    return new OutboxMessage(
      state.id,
      state.aggregateId,
      state.eventType,
      Object.freeze({
        ...state.payload,
      }),
      state.occurredAt,
      state.attempts,
      state.nextAttemptAt,
      state.publishedAt,
    );
  }

  get attempts(): number {
    return this._attempts;
  }

  get nextAttemptAt(): Date | undefined {
    return this._nextAttemptAt;
  }

  get publishedAt(): Date | undefined {
    return this._publishedAt;
  }

  isPending(): boolean {
    return this._publishedAt === undefined;
  }

  isDue(now: Date): boolean {
    return (
      this.isPending() &&
      (
        this._nextAttemptAt === undefined ||
        this._nextAttemptAt <= now
      )
    );
  }

  markPublished(at: Date): void {
    if (!this.isPending()) {
      throw new Error(
        'Outbox message is already published',
      );
    }

    if (at < this.occurredAt) {
      throw new Error(
        'Published date cannot be before occurrence date',
      );
    }

    this._publishedAt = at;
    this._nextAttemptAt = undefined;
  }

  scheduleRetry(now: Date): void {
    if (!this.isPending()) {
      throw new Error(
        'Published outbox message cannot be retried',
      );
    }

    this._attempts += 1;

    const exponentialDelay =
      INITIAL_RETRY_DELAY_MS *
      2 ** (this._attempts - 1);

    const delay = Math.min(
      exponentialDelay,
      MAX_RETRY_DELAY_MS,
    );

    this._nextAttemptAt = new Date(
      now.getTime() + delay,
    );
  }
}