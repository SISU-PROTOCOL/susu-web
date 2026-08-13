import { freighterWallet } from './freighter';
import type { WalletAdapter, WalletId } from './types';

/**
 * Wallet registry.
 *
 * Freighter is the MVP wallet. Additional wallets are added by implementing
 * `WalletAdapter` and registering it here; nothing outside this module needs to
 * know which wallet is which.
 */

export const WALLETS: readonly WalletAdapter[] = [freighterWallet];

const BY_ID: ReadonlyMap<WalletId, WalletAdapter> = new Map(
  WALLETS.map((wallet) => [wallet.id, wallet]),
);

/** Returns the adapter for an id, or throws if it is not registered. */
export function getWallet(id: WalletId): WalletAdapter {
  const wallet = BY_ID.get(id);
  if (wallet === undefined) {
    throw new Error(`Unknown wallet "${id}".`);
  }
  return wallet;
}

/**
 * The wallets actually present in this browser.
 *
 * Availability is probed rather than assumed, so a browser without the extension
 * gets an empty list instead of a button that fails when pressed.
 */
export async function listAvailableWallets(): Promise<WalletAdapter[]> {
  const results = await Promise.all(
    WALLETS.map(async (wallet) => ((await wallet.isAvailable()) ? wallet : undefined)),
  );
  return results.filter((wallet): wallet is WalletAdapter => wallet !== undefined);
}

export { freighterWallet } from './freighter';
export { WalletError } from './errors';
export type { WalletErrorCode } from './errors';
export type {
  SignedTransaction,
  SignTransactionOptions,
  WalletAccount,
  WalletAdapter,
  WalletId,
} from './types';
