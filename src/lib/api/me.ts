/**
 * The account surface, as this app uses it.
 *
 * This is the only part of the app that describes the *account* rather than the
 * protocol: the display name, the optional photo, the wallet that has been
 * proved, and the feed of chain activity across that wallet's groups.
 *
 * WHY THE TOKEN IS A PARAMETER
 * As in `invites.ts`, the caller supplies the token rather than this module
 * reading the session. That keeps the module testable without a browser session
 * and makes it visible at every call site that the request is authenticated.
 *
 * WHAT THE WALLET ADDRESS IS AND IS NOT
 * `walletAddress` is a server-side binding proved by a signature over a nonce,
 * stored by the API. It is not the connected wallet — that is a browser fact, and
 * the two can differ: a user may be signed in with one account, hold a wallet
 * linked to that account, and have a different wallet connected right now. This
 * module reports the binding, never the connection.
 */
import { apiRequest, apiRequestPage, type ApiPage } from './client';
import type { ActivityRecord } from './groups';

/** The account, as the API reports it. Nulls mean "not set", not "missing". */
export type Account = {
  readonly userId: string;
  readonly displayName: string | null;
  /** An object key in the profile bucket, never a URL. */
  readonly avatarPath: string | null;
  /** The proved binding, or `null` if no wallet has been linked. */
  readonly walletAddress: string | null;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
};

/**
 * The fields a user may change.
 *
 * Both are nullable, and absent still means "leave it alone". A caller that wants
 * to clear a name sends `null`; one that does not mention it leaves it as it was.
 */
export type ProfileChanges = {
  readonly displayName?: string | null;
  readonly avatarPath?: string | null;
};

/**
 * One event in the caller's feed, with the group it belongs to.
 *
 * The same event the per-group list returns, plus `contractId` — a feed spans
 * groups, so a row without it could not be linked back to anything.
 */
export type MemberActivityRecord = ActivityRecord & {
  readonly contractId: string;
};

/** Reads the signed-in account. */
export async function getMe(token: string, signal?: AbortSignal): Promise<Account> {
  return apiRequest<Account>('me', { token, ...(signal ? { signal } : {}) });
}

/**
 * Applies profile changes.
 *
 * Only the mentioned fields are sent, so a request that sets a photo cannot
 * accidentally clear a name the user never touched — the API treats absence and
 * `null` as different things, and this function preserves that distinction.
 */
export async function updateMe(changes: ProfileChanges, token: string): Promise<Account> {
  const body: Record<string, string | null> = {};
  if (changes.displayName !== undefined) body.displayName = changes.displayName;
  if (changes.avatarPath !== undefined) body.avatarPath = changes.avatarPath;

  return apiRequest<Account>('me', { method: 'PATCH', token, body });
}

/**
 * Deletes the account.
 *
 * The confirmation value is required by the API and sent from here rather than
 * assembled by a caller, so there is exactly one place in the app that can ask
 * for a deletion and one shape it can send. It is a speed bump, not a security
 * control: the request is already authenticated as the account being deleted.
 *
 * Resolves with nothing, because the API answers 204. Deletion does not reach
 * chain history — contributions and payouts are keyed by wallet and contract,
 * never by user id — so nothing derived from the chain disappears with it.
 */
export async function deleteAccount(token: string): Promise<void> {
  return apiRequest<void>('me', { method: 'DELETE', token, body: { confirm: 'DELETE' } });
}

/** One page of the caller's feed, newest first. */
export async function listMyActivity(
  page: { limit?: number; offset?: number },
  token: string,
  signal?: AbortSignal,
): Promise<ApiPage<MemberActivityRecord>> {
  const search = new URLSearchParams();
  if (page.limit !== undefined) search.set('limit', String(page.limit));
  if (page.offset !== undefined) search.set('offset', String(page.offset));
  const encoded = search.toString();

  return apiRequestPage<MemberActivityRecord>(`me/activity${encoded === '' ? '' : `?${encoded}`}`, {
    token,
    ...(signal ? { signal } : {}),
  });
}
