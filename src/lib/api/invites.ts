/**
 * Invites, as this app uses them.
 *
 * An invite code is opaque: random, unguessable, and unrelated to the group's
 * address. That is a change from the first version of this flow, which put the
 * contract address in the link. The reasoning behind that version was sound about
 * authority — the address grants nothing, and the contract decides who may join —
 * and wrong about secrecy, because a contract address is published on chain and
 * can be enumerated. A link that contains one is a link everyone already has.
 *
 * So the code is a secret, and this module treats it as one: it is put in the URL
 * path for a human to share, sent to the API in a request body rather than a
 * query string so it does not land in server logs, and never stored — the API
 * cannot return it after creation, so there is nothing to store.
 */
import { apiRequest } from './client';

/** Where a shared invite link points. */
export const INVITE_PATH_PREFIX = '/join/';

export type Invite = {
  readonly code: string;
  readonly groupContractId: string;
  /** ISO 8601, or `null` when the invite does not expire. */
  readonly expiresAt: string | null;
  readonly maxUses: number | null;
  readonly uses: number;
};

/** What redeeming a code reports: which group the code admits to. */
export type RedeemedInvite = {
  readonly groupContractId: string;
  readonly inviteId: string;
};

export type CreateInviteInput = {
  readonly groupContractId: string;
  readonly expiresInHours?: number;
  readonly maxUses?: number;
};

/**
 * Creates a code for a group.
 *
 * The response is the only time the code exists in a readable form — the API
 * stores it and will not return it again — so a caller must show it or lose it.
 */
export async function createInvite(input: CreateInviteInput, token: string): Promise<Invite> {
  return apiRequest<Invite>(`groups/${encodeURIComponent(input.groupContractId)}/invites`, {
    method: 'POST',
    token,
    body: {
      ...(input.expiresInHours === undefined ? {} : { expiresInHours: input.expiresInHours }),
      ...(input.maxUses === undefined ? {} : { maxUses: input.maxUses }),
    },
  });
}

/**
 * Redeems a code, and reports which group it admits to.
 *
 * With an opaque code this is also how the client learns the group's address:
 * without it there is nothing to read from the chain and nothing to send a join
 * transaction to.
 *
 * This claims a use of the invite. It does not join the group — only the chain can
 * do that — so a caller must follow it with an on-chain join, and should call it
 * from an explicit user action rather than on page load. Merely opening a link
 * should not spend a limited invite.
 */
export async function redeemInvite(code: string, token: string): Promise<RedeemedInvite> {
  return apiRequest<RedeemedInvite>('invites/redeem', {
    method: 'POST',
    token,
    body: { code },
  });
}

/**
 * The shareable link for a code.
 *
 * Built from the running app's own origin rather than a configured URL, so a link
 * created in development points at development and one created in production
 * points at production. A configured base would be one more value to get wrong,
 * and getting it wrong would send invitees to the wrong site.
 */
export function inviteLink(code: string, origin: string): string {
  return `${origin.replace(/\/+$/, '')}${INVITE_PATH_PREFIX}${encodeURIComponent(code)}`;
}

/**
 * Whether a string could be an invite code.
 *
 * Matches the API's own shape check, which is the authority. This exists to tell
 * "you followed a malformed link" from "your code was not accepted", which are
 * different problems with different remedies — and to avoid a pointless request
 * for a value that cannot match a row.
 */
export function looksLikeInviteCode(value: string): boolean {
  return /^[A-Za-z0-9_-]{22,64}$/.test(value) && !/^[GC][A-Z2-7]{55}$/.test(value);
}
