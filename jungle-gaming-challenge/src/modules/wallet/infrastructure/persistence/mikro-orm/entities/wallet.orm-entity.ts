import {
  Check,
  Entity,
  Index,
  PrimaryKey,
  Property,
} from '@mikro-orm/decorators/legacy';

@Entity({ tableName: 'wallets' })
@Index({ properties: ['playerId'] })
@Check({
  name: 'wallets_balance_non_negative_check',
  expression: 'balance >= 0',
})
@Check({
  name: 'wallets_version_positive_check',
  expression: 'version >= 1',
})
export class WalletOrmEntity {
  @PrimaryKey({
    type: 'string',
    length: 100,
  })
  id!: string;

  @Property({
    fieldName: 'player_id',
    type: 'string',
    length: 100,
  })
  playerId!: string;

  @Property({
    fieldName: 'currency',
    type: 'string',
    length: 3,
  })
  currency!: string;

  @Property({
    fieldName: 'balance',
    type: 'string',
    columnType: 'numeric(20, 2)',
  })
  balance!: string;

  @Property({
    fieldName: 'version',
    type: 'number',
    columnType: 'integer',
  })
  version!: number;

  @Property({
    fieldName: 'created_at',
    type: Date,
    columnType: 'timestamptz',
  })
  createdAt!: Date;

  @Property({
    fieldName: 'updated_at',
    type: Date,
    columnType: 'timestamptz',
  })
  updatedAt!: Date;
}