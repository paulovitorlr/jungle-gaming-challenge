import { WalletId } from '../../../../shared/domain/value-objects/wallet-id.vo.js';
import type { WalletRepository } from '../../domain/repositories/wallet.repository.js';

export class GetWalletUseCase {
  constructor(private readonly wallets: WalletRepository) {}

  async execute(walletId: string) {
    const wallet = await this.wallets.findById(WalletId.from(walletId));
    if (!wallet) return null;

    return {
      id: wallet.id.toString(),
      playerId: wallet.playerId,
      balance: wallet.balance.toJSON(),
      version: wallet.version,
      createdAt: wallet.createdAt.toISOString(),
      updatedAt: wallet.updatedAt.toISOString(),
    };
  }
}
