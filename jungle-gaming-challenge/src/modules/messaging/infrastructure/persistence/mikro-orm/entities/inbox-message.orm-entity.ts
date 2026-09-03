import { Entity, PrimaryKey, Property } from '@mikro-orm/decorators/legacy';

@Entity({
  tableName: 'inbox_messages',
})
export class InboxMessageOrmEntity {
  @PrimaryKey({
    fieldName: 'consumer_name',
    type: 'string',
    length: 100,
  })
  consumerName!: string;

  @PrimaryKey({
    fieldName: 'message_id',
    type: 'string',
    length: 100,
  })
  messageId!: string;

  @Property({
    fieldName: 'payload_hash',
    type: 'string',
    length: 128,
  })
  payloadHash!: string;

  @Property({
    fieldName: 'received_at',
    type: Date,
    columnType: 'timestamptz',
  })
  receivedAt!: Date;

  @Property({
    fieldName: 'processed_at',
    type: Date,
    columnType: 'timestamptz',
    nullable: true,
  })
  processedAt?: Date;
}
