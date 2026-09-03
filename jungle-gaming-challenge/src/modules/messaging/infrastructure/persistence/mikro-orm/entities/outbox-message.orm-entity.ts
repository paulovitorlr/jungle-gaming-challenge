import {
  Check,
  Entity,
  Index,
  PrimaryKey,
  Property,
} from '@mikro-orm/decorators/legacy';

@Entity({
  tableName: 'outbox_messages',
})
@Index({
  name: 'outbox_messages_pending_index',
  properties: [
    'publishedAt',
    'lockedUntil',
    'nextAttemptAt',
    'occurredAt',
    'id',
  ],
})
@Check({
  name: 'outbox_messages_attempts_non_negative_check',
  expression: 'attempts >= 0',
})
export class OutboxMessageOrmEntity {
  @PrimaryKey({
    type: 'string',
    length: 100,
  })
  id!: string;

  @Property({
    fieldName: 'aggregate_id',
    type: 'string',
    length: 100,
  })
  aggregateId!: string;

  @Property({
    fieldName: 'event_type',
    type: 'string',
    length: 100,
  })
  eventType!: string;

  @Property({
    type: 'json',
    columnType: 'jsonb',
  })
  payload!: Record<string, unknown>;

  @Property({
    fieldName: 'occurred_at',
    type: Date,
    columnType: 'timestamptz',
  })
  occurredAt!: Date;

  @Property({
    type: 'integer',
    default: 0,
  })
  attempts!: number;

  @Property({
    fieldName: 'next_attempt_at',
    type: Date,
    columnType: 'timestamptz',
    nullable: true,
  })
  nextAttemptAt?: Date;

  @Property({
    fieldName: 'lock_id',
    type: 'string',
    length: 100,
    nullable: true,
  })
  lockId?: string;

  @Property({
    fieldName: 'locked_until',
    type: Date,
    columnType: 'timestamptz',
    nullable: true,
  })
  lockedUntil?: Date;

  @Property({
    fieldName: 'published_at',
    type: Date,
    columnType: 'timestamptz',
    nullable: true,
  })
  publishedAt?: Date;
}
