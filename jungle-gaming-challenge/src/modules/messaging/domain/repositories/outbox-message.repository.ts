import { OutboxMessage } from '../entities/outbox-message.js';

export abstract class OutboxMessageRepository {
  abstract add(
    message: OutboxMessage,
  ): Promise<void>;

  abstract findDueForPublishing(
    now: Date,
    limit: number,
  ): Promise<OutboxMessage[]>;

  abstract update(
    message: OutboxMessage,
  ): Promise<void>;
}