import { randomUUID } from 'node:crypto';

import {
  IntegrationEvent,
  type IntegrationEventProps,
} from '../../../../shared/domain/events/integration-event.js';

import type { EventContext } from '../../../../shared/domain/events/event-context.js';
import type { MoneyProps } from '../../../../shared/domain/value-objects/money.vo.js';

import { WagerTransaction } from '../entities/wager-transaction.js';
import { WagerTransactionKind } from '../enums/wager-transaction-kind.enum.js';
import { WagerTransactionStatus } from '../enums/wager-transaction-status.enum.js';

export type WagerTransactionProcessedData = {
  transactionId: string;
  providerId: string;
  externalTransactionId: string;
  walletId: string;
  playerId: string;
  roundId: string;
  gameId: string;
  kind: WagerTransactionKind;
  money: MoneyProps;
  resultingBalance: MoneyProps;
  referenceTransactionId?: string;
};

export class WagerTransactionProcessed extends IntegrationEvent<WagerTransactionProcessedData> {
  readonly eventType = 'WagerTransactionProcessed';

  readonly version = 1;

  private constructor(
    props: IntegrationEventProps<WagerTransactionProcessedData>,
  ) {
    super(props);
  }

  static from(
    transaction: WagerTransaction,
    context: EventContext,
  ): WagerTransactionProcessed {
    if (transaction.status !== WagerTransactionStatus.Processed) {
      throw new Error('Only processed transactions can produce this event');
    }

    if (!transaction.resultingBalance) {
      throw new Error('Processed transaction must have a resulting balance');
    }

    return new WagerTransactionProcessed({
      eventId: randomUUID(),
      aggregateId: transaction.id.toString(),
      correlationId: context.correlationId,
      causationId: context.causationId,
      occurredAt: context.occurredAt ?? transaction.processedAt ?? new Date(),

      data: {
        transactionId: transaction.id.toString(),
        providerId: transaction.providerId,
        externalTransactionId: transaction.externalTransactionId,
        walletId: transaction.walletId.toString(),
        playerId: transaction.playerId,
        roundId: transaction.roundId,
        gameId: transaction.gameId,
        kind: transaction.kind,
        money: transaction.money.toJSON(),
        resultingBalance: transaction.resultingBalance.toJSON(),
        referenceTransactionId: transaction.referenceTransactionId,
      },
    });
  }
}
