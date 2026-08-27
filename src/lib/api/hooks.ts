/**
 * API bindings for invite creation and redemption.
 *
 * Thin by design. The interesting decisions are in `invites.ts` and `client.ts`;
 * what is here is the token plumbing and the retry policy, which are the two
 * things React Query owns.
 *
 * RETRY, AND WHY REDEMPTION IS NOT RETRIED
 * A failed redemption must not be repeated automatically. Redeeming claims a use,
 * so a request that reached the server and failed on the way back would be
 * retried and claim a second one — and a limited invite would be consumed by a
 * flaky connection rather than by a member. Redeeming twice is idempotent for the
 * same user, so an explicit retry by the person is safe; a silent one is not,
 * because the time it is *not* idempotent is when the client believes the first
 * attempt failed and it did not.
 *
 * Creation is not retried either, for the same reason from the other side: a
 * duplicate would mint a second code, and the first would be lost.
 */
import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import { isRetryableApiError } from './errors';
import { getAccessToken } from './token';
import {
  createInvite,
  redeemInvite,
  type CreateInviteInput,
  type Invite,
  type RedeemedInvite,
} from './invites';

/** The token, or a clear failure. The API would answer 401 to an empty string. */
async function requireToken(): Promise<string> {
  const token = await getAccessToken();
  if (token === undefined) {
    throw new Error('Sign in before using invite links.');
  }
  return token;
}

export type CreateInviteVariables = Omit<CreateInviteInput, 'groupContractId'>;

/** Creates an invite code for a group. The code is readable only in the result. */
export function useCreateInvite(
  groupContractId: string | undefined,
): UseMutationResult<Invite, Error, CreateInviteVariables | void> {
  return useMutation<Invite, Error, CreateInviteVariables | void>({
    mutationFn: async (variables) => {
      if (groupContractId === undefined) throw new Error('A group is required.');
      return createInvite({ groupContractId, ...(variables ?? {}) }, await requireToken());
    },
    retry: false,
  });
}

/** Redeems an invite code, and reports the group it admits to. */
export function useRedeemInvite(): UseMutationResult<RedeemedInvite, Error, { code: string }> {
  return useMutation<RedeemedInvite, Error, { code: string }>({
    mutationFn: async ({ code }) => redeemInvite(code, await requireToken()),
    retry: false,
  });
}

// `isRetryableApiError` is used by callers that manage their own retries —
// screens polling for a transaction the indexer has not reached yet. Re-exported
// here so those screens import one module rather than three.
export { isRetryableApiError };
