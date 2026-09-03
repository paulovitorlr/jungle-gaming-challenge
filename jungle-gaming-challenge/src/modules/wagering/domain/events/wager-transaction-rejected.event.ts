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
import { WagerFailureCode } from '../enums/wager-failure-code.enum.js';

export type WagerTransactionRejectedData = {
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
  failureCode: WagerFailureCode;
};

export class WagerTransactionRejected
  extends IntegrationEvent<WagerTransactionRejectedData>
{
  readonly eventType =
    'WagerTransactionRejected';

  readonly version = 1;

  private constructor(
    props: IntegrationEventProps<WagerTransactionRejectedData>,
  ) {
    super(props);
  }

  static from(
    transaction: WagerTransaction,
    context: EventContext,
  ): WagerTransactionRejected {
    if (
      transaction.status !==
      WagerTransactionStatus.Rejected
    ) {
      throw new Error(
        'Only rejected transactions can produce this event',
      );
    }

    if (
      !transaction.failureCode ||
      !transaction.resultingBalance
    ) {
      throw new Error(
        'Rejected transaction must contain failure details',
      );
    }

    return new WagerTransactionRejected({
      eventId: randomUUID(),
      aggregateId:
        transaction.id.toString(),
      correlationId:
        context.correlationId,
      causationId: context.causationId,
      occurredAt:
        context.occurredAt ?? new Date(),

      data: {
        transactionId:
          transaction.id.toString(),
        providerId: transaction.providerId,
        externalTransactionId:
          transaction.externalTransactionId,
        walletId:
          transaction.walletId.toString(),
        playerId: transaction.playerId,
        roundId: transaction.roundId,
        gameId: transaction.gameId,
        kind: transaction.kind,
        money: transaction.money.toJSON(),
        resultingBalance:
          transaction.resultingBalance.toJSON(),
        failureCode:
          transaction.failureCode,
      },
    });
  }
}