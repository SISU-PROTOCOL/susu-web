import { createContext, useContext } from 'react';
import type { User } from '@supabase/supabase-js';

/**
 * Authentication session state.
 *
 * The context and its hook live here, apart from the provider component, so that
 * this module exports no components and fast refresh keeps working on the
 * provider.
 *
 * WHAT A SESSION IS HERE
 * It answers one question — whether there is a verified identity attached to this
 * browser, and who it is — and nothing else. It is not an authorization to
 * perform a financial action, and it is not the wallet. The two are separate on
 * purpose: an account can exist with no wallet linked, and a wallet can be
 * connected with no account, which is exactly what an invite link needs.
 *
 * Being signed in therefore never implies being able to move funds. Every
 * financial action still requires a wallet signature, and the chain to confirm.
 */

export type AuthStatus =
  /** Still reading the persisted session. Undecided, not anonymous. */
  | 'loading'
  /** No session. */
  | 'anonymous'
  /** A session is present and the provider considers it valid. */
  | 'authenticated';

export interface AuthContextValue {
  readonly status: AuthStatus;
  /** The authenticated user, present only when `status` is `authenticated`. */
  readonly user: User | undefined;
  /**
   * Revokes the session at the provider and clears it locally.
   *
   * Never rejects. The local session is cleared even when the revocation call
   * fails, because a sign-out that leaves the user apparently signed in is a
   * worse outcome than one that leaves a token valid until it expires.
   */
  signOut(): Promise<void>;
  /** Re-reads the session from the provider. */
  refresh(): Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/** Accesses the session. Throws outside an `AuthProvider`. */
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (value === undefined) {
    throw new Error('useAuth must be used inside an AuthProvider.');
  }
  return value;
}
