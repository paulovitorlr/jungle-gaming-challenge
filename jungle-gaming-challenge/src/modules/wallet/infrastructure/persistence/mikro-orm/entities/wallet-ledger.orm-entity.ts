import {
  Check,
  Entity,
  Enum,
  Index,
  ManyToOne,
  PrimaryKey,
  Property,
  Unique,
} from '@mikro-orm/decorators/legacy';

import { LedgerDirection } from '../../../../domain/enums/ledger-direction.enum.js';
import { WalletOrmEntity } from './wallet.orm-entity.js';

@Entity({ tableName: 'wallet_ledger_entries' })
@Unique({ properties: ['walletId', 'transactionId'] })
@Index({ properties: ['walletId', 'createdAt', 'id'] })
@Check({
  name: 'wallet_ledger_amount_positive_check',
  expression: 'amount > 0',
})
@Check({
  name: 'wallet_ledger_balances_non_negative_check',
  expression: 'balance_before >= 0 AND balance_after >= 0',
})
@Check({
  name: 'wallet_ledger_balanced_check',
  expression: `
    (
      (
        direction = 'CREDIT'
        AND balance_after = balance_before + amount
      )
      OR
      (
        direction = 'DEBIT'
        AND balance_after = balance_before - amount
      )
    )
  `,
})
export class WalletLedgerOrmEntity {
  @PrimaryKey({
    type: 'string',
    length: 100,
  })
  id!: string;

  @ManyToOne({
    entity: () => WalletOrmEntity,
    fieldName: 'wallet_id',
    mapToPk: true,
    deleteRule: 'restrict',
    updateRule: 'cascade',
  })
  walletId!: string;

  @Property({
    fieldName: 'transaction_id',
    type: 'string',
    length: 100,
  })
  transactionId!: string;

  @Enum({
    fieldName: 'direction',
    items: () => LedgerDirection,
  })
  direction!: LedgerDirection;

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
    fieldName: 'balance_before',
    type: 'string',
    columnType: 'numeric(20, 2)',
  })
  balanceBefore!: string;

  @Property({
    fieldName: 'balance_after',
    type: 'string',
    columnType: 'numeric(20, 2)',
  })
  balanceAfter!: string;

  @Property({
    fieldName: 'created_at',
    type: Date,
    columnType: 'timestamptz',
  })
  createdAt!: Date;
}
