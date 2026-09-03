import { Wallet } from '../../../../shared/domain/entities/wallet.entity.js';
import { WalletId } from '../../../../shared/domain/value-objects/wallet-id.vo.js';

export const WALLET_REPOSITORY = Symbol('WalletRepository');

export interface WalletRepository {
  findById(id: WalletId): Promise<Wallet | null>;

  add(wallet: Wallet): Promise<void>;

  update(wallet: Wallet, expectedVersion: number): Promise<boolean>;
}
