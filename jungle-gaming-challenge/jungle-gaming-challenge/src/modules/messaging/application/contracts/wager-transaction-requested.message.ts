import { WagerTransactionKind } from '../../../wagering/domain/enums/wager-transaction-kind.enum.js';

export type WagerTransactionRequestedData = {
  providerId: string;
  externalTransactionId: string;
  idempotencyKey: string;
  playerId: string;
  walletId: string;
  roundId: string;
  gameId: string;
  kind: WagerTransactionKind;
  money: {
    amount: string;
    currency: string;
  };
  referenceExternalTransactionId?: string;
};

export type WagerTransactionRequestedMessage = {
  messageId: string;
  type: 'WagerTransactionRequested';
  occurredAt: string;
  data: WagerTransactionRequestedData;
};
