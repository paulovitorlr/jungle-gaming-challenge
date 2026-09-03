import { randomUUID } from 'node:crypto';

import type { UnitOfWork } from '../../../../shared/application/ports/unit-of-work.js';
import { canonicalPayloadHash } from '../../../../shared/application/canonical-payload-hash.js';
import { Wallet } from '../../../../shared/domain/entities/wallet.entity.js';
import { Money } from '../../../../shared/domain/value-objects/money.vo.js';
import type { OutboxMessageRepository } from '../../../messaging/domain/repositories/outbox-message.repository.js';
import { OutboxMessage } from '../../../messaging/domain/entities/outbox-message.js';
import { WagerTransaction } from '../../../wagering/domain/entities/wager-transaction.js';
import { WagerTransactionKind } from '../../../wagering/domain/enums/wager-transaction-kind.enum.js';
import { WagerTransactionId } from '../../../wagering/domain/value-objects/wager-transaction-id.vo.js';
import { WagerTransactionProcessed } from '../../../wagering/domain/events/wager-transaction-processed.event.js';
import type { WagerTransactionRepository } from '../../../wagering/domain/repositories/wager-transaction.repository.js';
import { WalletBalanceChanged } from '../../domain/events/wallet-balance-changed.event.js';
import type { WalletLedgerRepository } from '../../domain/repositories/wallet-ledger.repository.js';
import type { WalletRepository } from '../../domain/repositories/wallet.repository.js';
import { WalletAlreadyExistsError } from '../errors/wallet-already-exists.error.js';

export class OpenWalletUseCase {
  constructor(
    private readonly walletRepository: WalletRepository,
    private readonly ledgerRepository: WalletLedgerRepository,
    private readonly transactionRepository: WagerTransactionRepository,
    private readonly outboxRepository: OutboxMessageRepository,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async execute(input: {
    playerId: string;
    initialBalance: { amount: string; currency: string };
  }): Promise<{
    id: string;
    playerId: string;
    balance: { amount: string; currency: string };
    version: number;
  }> {
    return this.unitOfWork.execute(async () => {
      const money = Money.from(input.initialBalance);
      if (money.isNegative())
        throw new Error('Initial balance cannot be negative');

      const existing = await this.walletRepository.findByPlayerAndCurrency(
        input.playerId,
        money.currency,
      );
      if (existing) throw new WalletAlreadyExistsError();

      const openingTransactionId = randomUUID();
      const { wallet, entry } = Wallet.openWithInitialBalance(
        input.playerId,
        money,
        openingTransactionId,
      );

      await this.walletRepository.add(wallet);

      if (entry) {
        const transaction = WagerTransaction.create({
          id: WagerTransactionId.from(openingTransactionId),
          providerId: 'internal',
          externalTransactionId: `opening:${wallet.id.toString()}`,
          idempotencyKey: `opening:${wallet.id.toString()}`,
          payloadHash: canonicalPayloadHash({
            playerId: input.playerId,
            walletId: wallet.id.toString(),
            money: money.toJSON(),
          }),
          walletId: wallet.id,
          playerId: input.playerId,
          roundId: `opening:${wallet.id.toString()}`,
          gameId: 'wallet-opening',
          kind: WagerTransactionKind.Opening,
          money,
          createdAt: wallet.createdAt,
        });
        transaction.markProcessed(undefined, wallet.balance, wallet.createdAt);

        await this.ledgerRepository.add(entry);
        await this.transactionRepository.save(transaction);

        const context = {
          correlationId: openingTransactionId,
          occurredAt: wallet.createdAt,
        };
        await this.outboxRepository.add(
          OutboxMessage.enqueue(
            WagerTransactionProcessed.from(transaction, context),
          ),
        );
        await this.outboxRepository.add(
          OutboxMessage.enqueue(
            WalletBalanceChanged.from(wallet, entry, context),
          ),
        );
      }

      return {
        id: wallet.id.toString(),
        playerId: wallet.playerId,
        balance: wallet.balance.toJSON(),
        version: wallet.version,
      };
    });
  }
}
