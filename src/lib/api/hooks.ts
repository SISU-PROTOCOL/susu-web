/**
 * React Query bindings for `susu-api`.
 *
 * Thin by design. The interesting decisions are in `invites.ts`, `groups.ts` and
 * `client.ts`; what is here is the token plumbing, the retry policy and the
 * polling policy, which are the things React Query owns.
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
 *
 * READS ARE RETRIED, BECAUSE THEY CANNOT CLAIM ANYTHING
 * The read hooks repeat a server fault or an unreachable server a couple of times
 * and never repeat a considered refusal. That is the opposite trade from the
 * mutations above, and it is safe precisely because a read has no effect to
 * duplicate.
 */
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { isRetryableApiError } from './errors';
import { getAccessToken } from './token';
import {
  createInvite,
  redeemInvite,
  type CreateInviteInput,
  type Invite,
  type RedeemedInvite,
} from './invites';
import {
  getTransactionReceipt,
  listContributions,
  listGroups,
  listPayouts,
  type ListGroupsQuery,
  type TransactionReceipt,
} from './groups';

/**
 * Repeats a read that failed for a reason that might not recur.
 *
 * `isRetryableApiError` excludes every considered refusal, so a 404 or a 400 is
 * reported immediately rather than delayed by pointless attempts that would
 * produce the same answer.
 */
function retryRead(failureCount: number, error: unknown): boolean {
  return failureCount < 2 && isRetryableApiError(error);
}

/**
 * How long the index's answers are treated as fresh.
 *
 * The index only changes when the indexer runs, which is every five minutes, so
 * refetching on every mount would mostly re-ask for an answer that cannot have
 * changed. Short enough that a member moving between screens sees their own
 * action appear; long enough that a screen is not a stream of identical requests.
 */
const INDEX_STALE_TIME_MS = 10_000;

/** Rows per request. The API's own default, named here so paging is explicit. */
const PAGE_SIZE = 20;

export const apiQueryKeys = {
  /**
   * Every group list, as an invalidation prefix.
   *
   * A list's own key adds its filters, so invalidating anything under this stops
   * one screen showing a group the next screen no longer lists — which is what a
   * newly joined or created group would otherwise do.
   */
  allGroups: ['api', 'groups'] as const,
  /** Every index read for one group, as an invalidation prefix. */
  groupLedger: (contractId: string) => ['api', 'group', contractId] as const,
  groups: (query: ListGroupsQuery) =>
    [
      ...apiQueryKeys.allGroups,
      query.status ?? '',
      query.member ?? '',
      query.creator ?? '',
    ] as const,
  contributions: (contractId: string) => ['api', 'group', contractId, 'contributions'] as const,
  payouts: (contractId: string) => ['api', 'group', contractId, 'payouts'] as const,
  transaction: (hash: string) => ['api', 'transaction', hash] as const,
};

/** Rows per request for a group's event history. */
const LEDGER_PAGE_SIZE = 10;

/**
 * Groups, as the index knows them, paged.
 *
 * An infinite query rather than a single page: the list is the answer to "what
 * groups exist", and a screen that shows the first twenty of them without a way
 * to reach the rest is presenting a partial list as a complete one.
 */
export function useIndexedGroups(query: ListGroupsQuery = {}) {
  return useInfiniteQuery({
    queryKey: apiQueryKeys.groups(query),
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }) =>
      listGroups({ ...query, limit: PAGE_SIZE, offset: pageParam }, signal),
    getNextPageParam: (lastPage) =>
      // The API's `hasMore`, not a guess from the row count: a full page is the
      // last page exactly as often as it is not.
      lastPage.hasMore ? lastPage.offset + lastPage.limit : undefined,
    retry: retryRead,
    staleTime: INDEX_STALE_TIME_MS,
  });
}

/**
 * The groups one account has joined.
 *
 * Filtered by the API against its membership rows, because the chain cannot
 * answer this: groups are addressed by hash, and nothing on-chain maps an account
 * to the groups it belongs to.
 */
export function useMemberGroups(member: string | undefined) {
  return useInfiniteQuery({
    queryKey: apiQueryKeys.groups({ member: member ?? '' }),
    enabled: member !== undefined,
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }) => {
      if (member === undefined) throw new Error('An account is required.');
      return listGroups({ member, limit: PAGE_SIZE, offset: pageParam }, signal);
    },
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.offset + lastPage.limit : undefined,
    retry: retryRead,
    staleTime: INDEX_STALE_TIME_MS,
  });
}

/**
 * How often to re-ask for a transaction the index has not reached yet.
 *
 * The indexer runs every five minutes, so this poll is a fanfare of requests
 * compared to the thing it waits for. It is short anyway because the common case
 * is a page opened from a confirmation dialog, where the index usually already
 * has the transaction and only one request is made.
 */
const RECEIPT_POLL_MS = 5_000;

/**
 * How many times to ask before giving up.
 *
 * Enough to cover an indexing run plus a little slack. A caller that gives up
 * must say so rather than keep a spinner turning forever: at that point the
 * honest answer is that the index has no record of the transaction, which is
 * either because no Susu contract was touched or because something is wrong with
 * the indexer.
 */
const RECEIPT_MAX_POLLS = 36;

function isAbsentFromIndex(error: unknown): boolean {
  return (error as { status?: unknown } | null)?.status === 404;
}

/**
 * The protocol's record of one transaction.
 *
 * 404 IS NOT ALWAYS A FAILURE
 * For a transaction that was just submitted, the index has not seen it yet, so
 * this polls while the API reports it missing and stops when it arrives. React
 * Query's own `retry` is not used for this — it treats a 404 as settled, and it
 * is right to; the absence here is expected rather than exceptional, which is a
 * distinction only the caller knows.
 *
 * `isAbsent` on the result tells a screen whether it is still waiting, so a page
 * opened with a hash that will never be indexed ends in an explanation instead of
 * a spinner that never stops.
 */
export function useTransactionReceipt(
  hash: string | undefined,
): UseQueryResult<TransactionReceipt, Error> & { readonly isAbsent: boolean } {
  const query = useQuery<TransactionReceipt, Error>({
    queryKey: apiQueryKeys.transaction(hash ?? ''),
    enabled: hash !== undefined,
    queryFn: async ({ signal }) => {
      if (hash === undefined) throw new Error('A transaction hash is required.');
      return getTransactionReceipt(hash, signal);
    },
    retry: retryRead,
    refetchInterval: (query) =>
      isAbsentFromIndex(query.state.error) && query.state.fetchFailureCount < RECEIPT_MAX_POLLS
        ? RECEIPT_POLL_MS
        : false,
  });

  // Still waiting distinguishes "keep watching" from "this will never appear",
  // using the same two facts the polling interval does.
  const isAbsent =
    isAbsentFromIndex(query.error) &&
    query.failureCount >= RECEIPT_MAX_POLLS &&
    query.data === undefined;

  // A copy, not a mutation: React Query may return the same result object across
  // renders, and attaching a property to it would leak this hook's concern into a
  // shared value.
  return { ...query, isAbsent };
}

/**
 * A group's contributions, as the index recorded them.
 *
 * WHO PAID, WHICH THE CHAIN DOES NOT SAY
 * The contract stores the running total for a round and how many members have
 * paid; the identities are in the events, and events are not readable from
 * contract state. So "who has contributed this round" is a question only the
 * index can answer, and it is the question a member actually asks when a round is
 * waiting.
 */
export function useGroupContributions(contractId: string | undefined) {
  return useInfiniteQuery({
    queryKey: apiQueryKeys.contributions(contractId ?? ''),
    enabled: contractId !== undefined,
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }) => {
      if (contractId === undefined) throw new Error('A group is required.');
      return listContributions(contractId, { limit: LEDGER_PAGE_SIZE, offset: pageParam }, signal);
    },
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.offset + lastPage.limit : undefined,
    retry: retryRead,
    staleTime: INDEX_STALE_TIME_MS,
  });
}

/** A group's payouts, as the index recorded them. */
export function useGroupPayouts(contractId: string | undefined) {
  return useInfiniteQuery({
    queryKey: apiQueryKeys.payouts(contractId ?? ''),
    enabled: contractId !== undefined,
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }) => {
      if (contractId === undefined) throw new Error('A group is required.');
      return listPayouts(contractId, { limit: LEDGER_PAGE_SIZE, offset: pageParam }, signal);
    },
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.offset + lastPage.limit : undefined,
    retry: retryRead,
    staleTime: INDEX_STALE_TIME_MS,
  });
}

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
