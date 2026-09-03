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

export type WagerTransactionPendingReferenceData = {
  transactionId: string;
  providerId: string;
  externalTransactionId: string;
  referenceExternalTransactionId: string;
  walletId: string;
  playerId: string;
  roundId: string;
  kind: WagerTransactionKind;
  money: MoneyProps;
};

export class WagerTransactionPendingReference extends IntegrationEvent<WagerTransactionPendingReferenceData> {
  readonly eventType = 'WagerTransactionPendingReference';
  readonly version = 1;

  private constructor(
    props: IntegrationEventProps<WagerTransactionPendingReferenceData>,
  ) {
    super(props);
  }

  static from(
    transaction: WagerTransaction,
    context: EventContext,
  ): WagerTransactionPendingReference {
    if (
      transaction.status !== WagerTransactionStatus.PendingReference ||
      !transaction.referenceExternalTransactionId
    ) {
      throw new Error('Pending reference transaction is incomplete');
    }

    return new WagerTransactionPendingReference({
      eventId: randomUUID(),
      aggregateId: transaction.id.toString(),
      correlationId: context.correlationId,
      causationId: context.causationId,
      occurredAt: context.occurredAt ?? new Date(),
      data: {
        transactionId: transaction.id.toString(),
        providerId: transaction.providerId,
        externalTransactionId: transaction.externalTransactionId,
        referenceExternalTransactionId:
          transaction.referenceExternalTransactionId,
        walletId: transaction.walletId.toString(),
        playerId: transaction.playerId,
        roundId: transaction.roundId,
        kind: transaction.kind,
        money: transaction.money.toJSON(),
      },
    });
  }
}
