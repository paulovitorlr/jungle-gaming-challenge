import { OutboxMessage } from '../../domain/entities/outbox-message.js';

export abstract class IntegrationEventPublisher {
  abstract publish(message: OutboxMessage): Promise<void>;
}
