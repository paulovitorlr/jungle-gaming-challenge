import {
  Entity,
  Index,
  PrimaryKey,
  Property,
  Unique,
} from '@mikro-orm/decorators/legacy';

@Entity({ tableName: 'wager_transactions' })

@Unique({
  properties: ['providerId', 'externalTransactionId'],
})

@Index({
  properties: ['walletId'],
})

@Index({
  properties: ['providerId', 'externalTransactionId'],
})

export class WagerTransactionOrmEntity {
  @PrimaryKey({
    type: 'string',
    length: 100,
  })
  id!: string;

  @Property({
    fieldName: 'provider_id',
    type: 'string',
    length: 100,
  })
  providerId!: string;

  @Property({
    fieldName: 'external_transaction_id',
    type: 'string',
    length: 100,
  })
  externalTransactionId!: string;

  @Property({
    fieldName: 'idempotency_key',
    type: 'string',
    length: 200,
    unique: true,
  })
  idempotencyKey!: string;

  @Property({
    fieldName: 'payload_hash',
    type: 'string',
    length: 128,
  })
  payloadHash!: string;

  @Property({
    fieldName: 'wallet_id',
    type: 'string',
    length: 100,
  })
  walletId!: string;

  @Property({
    fieldName: 'player_id',
    type: 'string',
    length: 100,
  })
  playerId!: string;

  @Property({
    fieldName: 'round_id',
    type: 'string',
    length: 100,
  })
  roundId!: string;

  @Property({
    fieldName: 'game_id',
    type: 'string',
    length: 100,
  })
  gameId!: string;

  @Property({
    fieldName: 'kind',
    type: 'string',
    length: 30,
  })
  kind!: string;

  @Property({
    fieldName: 'amount',
    type: 'string',
    columnType: 'numeric(20, 2)',
  })
  amount!: string;

  @Property({
    fieldName: 'currency',
    type: 'string',
    length: 3,
  })
  currency!: string;

  @Property({
    fieldName: 'reference_external_transaction_id',
    type: 'string',
    length: 100,
    nullable: true,
  })
  referenceExternalTransactionId?: string;

  @Property({
    fieldName: 'reference_transaction_id',
    type: 'string',
    length: 100,
    nullable: true,
  })
  referenceTransactionId?: string;

  @Property({
    fieldName: 'status',
    type: 'string',
    length: 30,
  })
  status!: string;

  @Property({
    fieldName: 'failure_code',
    type: 'string',
    length: 100,
    nullable: true,
  })
  failureCode?: string;

  @Property({
    fieldName: 'created_at',
    type: Date,
    columnType: 'timestamptz',
  })
  createdAt!: Date;

  @Property({
    fieldName: 'processed_at',
    type: Date,
    columnType: 'timestamptz',
    nullable: true,
  })
  processedAt?: Date;
}