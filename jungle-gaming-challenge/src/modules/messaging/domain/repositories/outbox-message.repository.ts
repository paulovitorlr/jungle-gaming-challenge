import { OutboxMessage } from '../entities/outbox-message.js';

export type ClaimOutboxMessagesOptions = {
  now: Date;
  limit: number;
  lockId: string;
  lockedUntil: Date;
};

export abstract class OutboxMessageRepository {
  abstract add(message: OutboxMessage): Promise<void>;

  abstract claimDueForPublishing(
    options: ClaimOutboxMessagesOptions,
  ): Promise<OutboxMessage[]>;

  abstract updateClaimed(
    message: OutboxMessage,
    lockId: string,
  ): Promise<boolean>;
}
