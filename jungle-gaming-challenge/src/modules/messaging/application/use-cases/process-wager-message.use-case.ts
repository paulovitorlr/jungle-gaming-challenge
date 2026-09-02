import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { Inject } from '@nestjs/common';

import {
  UNIT_OF_WORK,
  type UnitOfWork,
} from '../../../../shared/application/ports/unit-of-work.js';

import { UniqueConstraintViolationError } from '../../../../shared/application/errors/unique-constraint-violation.error.js';

import {
  ProcessWagerTransactionUseCase,
  type ProcessWagerTransactionOutput,
} from '../../../wagering/application/use-cases/process-wager-transaction.use-case.js';

import { InboxMessage } from '../../domain/entities/inbox-message.js';
import { InboxMessageRepository } from '../../domain/repositories/inbox-message.repository.js';

import { InboxPayloadConflictError } from '../errors/inbox-payload-conflict.error.js';

import type { WagerTransactionRequestedMessage } from '../contracts/wager-transaction-requested.message.js';

const CONSUMER_NAME =
  'wager-transaction-consumer';

export type ProcessWagerMessageOutput = {
  duplicateMessage: boolean;
  wager?: ProcessWagerTransactionOutput;
};

@Injectable()
export class ProcessWagerMessageUseCase {
  constructor(
    private readonly inboxRepository:
      InboxMessageRepository,

    private readonly processWagerTransaction:
      ProcessWagerTransactionUseCase,

    @Inject(UNIT_OF_WORK)
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async execute(
    message: WagerTransactionRequestedMessage,
  ): Promise<ProcessWagerMessageOutput> {
    const payloadHash = this.calculatePayloadHash(
      message.data,
    );

    try {
      return await this.unitOfWork.execute(
        async () => {
          const existing =
            await this.inboxRepository.findByIdentity(
              CONSUMER_NAME,
              message.messageId,
            );

          if (existing) {
            return this.resolveExisting(
              existing,
              payloadHash,
            );
          }

          const inboxMessage =
            InboxMessage.receive({
              consumerName: CONSUMER_NAME,
              messageId: message.messageId,
              payloadHash,
            });

          const wager =
            await this.processWagerTransaction.execute({
              providerId:
                message.data.providerId,

              externalTransactionId:
                message.data.externalTransactionId,

              idempotencyKey:
                message.data.idempotencyKey,

              payloadHash,

              walletId:
                message.data.walletId,

              playerId:
                message.data.playerId,

              roundId:
                message.data.roundId,

              gameId:
                message.data.gameId,

              kind:
                message.data.kind,

              amount:
                message.data.money.amount,

              currency:
                message.data.money.currency,

              referenceExternalTransactionId:
                message.data
                  .referenceExternalTransactionId,
            });

          inboxMessage.markProcessed(
            new Date(),
          );

          await this.inboxRepository.add(
            inboxMessage,
          );

          return {
            duplicateMessage: false,
            wager,
          };
        },
      );
    } catch (error) {
      const isInboxRace =
        error instanceof
          UniqueConstraintViolationError &&
        error.constraint ===
          'inbox_messages_pkey';

      if (!isInboxRace) {
        throw error;
      }

      return this.unitOfWork.execute(
        async () => {
          const existing =
            await this.inboxRepository.findByIdentity(
              CONSUMER_NAME,
              message.messageId,
            );

          if (!existing) {
            throw error;
          }

          return this.resolveExisting(
            existing,
            payloadHash,
          );
        },
      );
    }
  }

  private resolveExisting(
    existing: InboxMessage,
    payloadHash: string,
  ): ProcessWagerMessageOutput {
    if (
      !existing.matchesPayload(payloadHash)
    ) {
      throw new InboxPayloadConflictError();
    }

    if (!existing.isProcessed()) {
      throw new Error(
        'Inbox message exists but was not processed',
      );
    }

    return {
      duplicateMessage: true,
    };
  }

  private calculatePayloadHash(
    payload: unknown,
  ): string {
    return createHash('sha256')
      .update(this.canonicalize(payload))
      .digest('hex');
  }

  private canonicalize(value: unknown): string {
    if (Array.isArray(value)) {
      return `[${value
        .map((item) => this.canonicalize(item))
        .join(',')}]`;
    }

    if (
      value !== null &&
      typeof value === 'object'
    ) {
      const record =
        value as Record<string, unknown>;

      const properties = Object.keys(record)
        .filter(
          (key) =>
            record[key] !== undefined,
        )
        .sort()
        .map(
          (key) =>
            `${JSON.stringify(key)}:${this.canonicalize(
              record[key],
            )}`,
        );

      return `{${properties.join(',')}}`;
    }

    return JSON.stringify(value) ?? 'null';
  }
}