import { createContext, useContext } from 'react';
import type { WalletAccount, WalletAdapter, WalletError } from './index';

/**
 * Wallet session state.
 *
 * The context and its hook live here, apart from the provider component, so that
 * this module exports no components and fast refresh keeps working on the
 * provider.
 *
 * Two rules shape a session:
 *
 *   1. No prompting on load. Connecting runs on a user gesture, never as a side
 *      effect of rendering a page. On mount the provider only asks whether an
 *      account is *already* authorized, which never opens a wallet window.
 *   2. A connected account is an identity, not an authorization. Nothing here
 *      grants the app any ability to move funds; every action still requires the
 *      wallet to sign, and the chain to confirm.
 */

export type WalletStatus =
  /** Still determining whether a wallet exists and is already authorized. */
  | 'checking'
  /** No wallet extension is present. */
  | 'unavailable'
  /** A wallet is present, but this site is not authorized. */
  | 'disconnected'
  /** Waiting for the user to answer the wallet's prompt. */
  | 'connecting'
  | 'connected';

export interface WalletContextValue {
  readonly status: WalletStatus;
  /** The authorized account, present only when `status` is `connected`. */
  readonly address: string | undefined;
  /** The adapter backing this session, present once one is available. */
  readonly wallet: WalletAdapter | undefined;
  /** Wallets detected in this browser. */
  readonly available: readonly WalletAdapter[];
  /** The reason the last connection attempt failed, if any. */
  readonly error: WalletError | undefined;
  /**
   * Requests access. Call from a user gesture, never on mount.
   *
   * Returns the account on success, and `undefined` when the user declined or no
   * wallet is present. `address` in this context updates on the next render, so a
   * caller that has to *use* the address immediately — linking it to an account,
   * which asks it to sign before anything is stored — needs it as a return value
   * rather than by waiting for a re-render it does not control.
   */
  connect(): Promise<WalletAccount | undefined>;
  /** Forgets the local session. Does not, and cannot, revoke anything on-chain. */
  disconnect(): void;
}

export const WalletContext = createContext<WalletContextValue | undefined>(undefined);

/** Accesses the wallet session. Throws outside a `WalletProvider`. */
export function useWallet(): WalletContextValue {
  const value = useContext(WalletContext);
  if (value === undefined) {
    throw new Error('useWallet must be used inside a WalletProvider.');
  }
  return value;
}
