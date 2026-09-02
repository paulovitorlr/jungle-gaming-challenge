import { WalletLedgerEntry } from '../entities/wallet-ledger-entry.js';

export const WALLET_LEDGER_REPOSITORY = Symbol(
  'WalletLedgerRepository',
);

export interface WalletLedgerRepository {
  add(entry: WalletLedgerEntry): Promise<void>;
}