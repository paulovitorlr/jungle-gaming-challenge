import { WalletId } from '../../../../shared/domain/value-objects/wallet-id.vo.js';
import type { WalletLedgerRepository } from '../../domain/repositories/wallet-ledger.repository.js';

export class GetWalletLedgerUseCase {
  constructor(private readonly ledger: WalletLedgerRepository) {}

  async execute(input: { walletId: string; cursor?: string; limit?: number }) {
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
    const entries = await this.ledger.findByWalletId(
      WalletId.from(input.walletId),
    );
    const cursor = input.cursor ? this.decodeCursor(input.cursor) : undefined;
    const filtered = cursor
      ? entries.filter(
          (entry) =>
            entry.createdAt.toISOString() > cursor.createdAt ||
            (entry.createdAt.toISOString() === cursor.createdAt &&
              entry.id > cursor.id),
        )
      : entries;
    const page = filtered.slice(0, limit);
    const last = page.at(-1);

    return {
      items: page.map((entry) => ({
        id: entry.id,
        walletId: entry.walletId.toString(),
        transactionId: entry.transactionId,
        direction: entry.direction,
        money: entry.money.toJSON(),
        balanceBefore: entry.balanceBefore.toJSON(),
        balanceAfter: entry.balanceAfter.toJSON(),
        createdAt: entry.createdAt.toISOString(),
      })),
      nextCursor:
        filtered.length > page.length && last
          ? Buffer.from(
              JSON.stringify({
                createdAt: last.createdAt.toISOString(),
                id: last.id,
              }),
            ).toString('base64url')
          : undefined,
    };
  }

  private decodeCursor(cursor: string): { createdAt: string; id: string } {
    try {
      const parsed = JSON.parse(
        Buffer.from(cursor, 'base64url').toString('utf8'),
      ) as Record<string, unknown>;
      if (
        typeof parsed.createdAt !== 'string' ||
        typeof parsed.id !== 'string'
      ) {
        throw new Error();
      }
      return { createdAt: parsed.createdAt, id: parsed.id };
    } catch {
      throw new Error('Invalid ledger cursor');
    }
  }
}
