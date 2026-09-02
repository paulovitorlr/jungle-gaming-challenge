import { InboxMessage } from '../entities/inbox-message.js';

export abstract class InboxMessageRepository {
  abstract findByIdentity(
    consumerName: string,
    messageId: string,
  ): Promise<InboxMessage | null>;

  abstract add(
    message: InboxMessage,
  ): Promise<void>;
}