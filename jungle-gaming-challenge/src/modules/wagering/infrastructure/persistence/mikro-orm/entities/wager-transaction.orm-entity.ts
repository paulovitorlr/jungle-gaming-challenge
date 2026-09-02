import {
  Check,
  Entity,
  Index,
  ManyToOne,
  PrimaryKey,
  Property,
  Unique,
} from '@mikro-orm/decorators/legacy';

import { WalletOrmEntity } from '../../../../../wallet/infrastructure/persistence/mikro-orm/entities/wallet.orm-entity.js'; 

@Entity({ tableName: 'wager_transactions' })

@Unique({
  name: 'uq_wager_transactions_provider_external_transaction',
  properties: ['providerId', 'externalTransactionId'],
})

@Unique({
  name: 'uq_wager_transactions_provider_idempotency_key',
  properties: ['providerId', 'idempotencyKey'],
})

@Index({
  properties: ['walletId'],
})

@Check({
  name: 'wager_transactions_amount_positive_check',
  expression: '"amount" > 0',
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
  })
  idempotencyKey!: string;

  @Property({
    fieldName: 'payload_hash',
    type: 'string',
    length: 128,
  })
  payloadHash!: string;

  @ManyToOne({
    entity: () => WalletOrmEntity,
    fieldName: 'wallet_id',
    mapToPk: true,
    deleteRule: 'restrict',
    updateRule: 'cascade',
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