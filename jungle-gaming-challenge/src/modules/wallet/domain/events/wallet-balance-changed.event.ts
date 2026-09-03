import { randomUUID } from 'node:crypto';

import {
  IntegrationEvent,
  type IntegrationEventProps,
} from '../../../../shared/domain/events/integration-event.js';

import type { EventContext } from '../../../../shared/domain/events/event-context.js';
import type { MoneyProps } from '../../../../shared/domain/value-objects/money.vo.js';

import { Wallet } from '../../../../shared/domain/entities/wallet.entity.js';

import { WalletLedgerEntry } from '../entities/wallet-ledger-entry.js';
import { LedgerDirection } from '../enums/ledger-direction.enum.js';

export type WalletBalanceChangedData = {
  walletId: string;
  transactionId: string;
  direction: LedgerDirection;
  money: MoneyProps;
  balanceBefore: MoneyProps;
  balanceAfter: MoneyProps;
  walletVersion: number;
};

export class WalletBalanceChanged extends IntegrationEvent<WalletBalanceChangedData> {
  readonly eventType = 'WalletBalanceChanged';

  readonly version = 1;

  private constructor(props: IntegrationEventProps<WalletBalanceChangedData>) {
    super(props);
  }

  static from(
    wallet: Wallet,
    entry: WalletLedgerEntry,
    context: EventContext,
  ): WalletBalanceChanged {
    if (!wallet.id.equals(entry.walletId)) {
      throw new Error('Ledger entry does not belong to the wallet');
    }

    return new WalletBalanceChanged({
      eventId: randomUUID(),
      aggregateId: wallet.id.toString(),
      correlationId: context.correlationId,
      causationId: context.causationId,
      occurredAt: context.occurredAt ?? entry.createdAt,

      data: {
        walletId: wallet.id.toString(),
        transactionId: entry.transactionId,
        direction: entry.direction,
        money: entry.money.toJSON(),
        balanceBefore: entry.balanceBefore.toJSON(),
        balanceAfter: entry.balanceAfter.toJSON(),
        walletVersion: wallet.version,
      },
    });
  }
}
