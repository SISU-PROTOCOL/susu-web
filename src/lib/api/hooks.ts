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
  useQueryClient,
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
  deleteAccount,
  getMe,
  listMyActivity,
  updateMe,
  type Account,
  type ProfileChanges,
} from './me';
import { listNotifications, markNotificationRead } from './notifications';
import { requestWalletNonce, verifyWalletLink, type LinkedWallet } from './wallet';
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
  /** The signed-in account. One key, because there is one account per session. */
  me: ['api', 'me'] as const,
  /** The caller's own feed. */
  myActivity: ['api', 'me', 'activity'] as const,
  /**
   * Notifications, as an invalidation prefix and per filter.
   *
   * A separate key per filter rather than one key with the filter in the query:
   * the unread-only list and the full list hold different rows, and sharing a
   * cache entry between them would make the badge and the list disagree.
   */
  allNotifications: ['api', 'notifications'] as const,
  notifications: (unreadOnly: boolean) =>
    [...apiQueryKeys.allNotifications, unreadOnly ? 'unread' : 'all'] as const,
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

/**
 * The signed-in account.
 *
 * Account data is not the index: nothing about it changes because the indexer
 * ran, so it does not poll. It is invalidated by the mutations below instead,
 * which is what keeps a rename or a photo from being the one change the screen
 * does not show.
 */
export function useMe(): UseQueryResult<Account, Error> {
  return useQuery<Account, Error>({
    queryKey: apiQueryKeys.me,
    queryFn: async ({ signal }) => getMe(await requireToken(), signal),
    retry: retryRead,
  });
}

/** Applies profile changes and refreshes the account. */
export function useUpdateProfile(): UseMutationResult<Account, Error, ProfileChanges> {
  const queryClient = useQueryClient();

  return useMutation<Account, Error, ProfileChanges>({
    mutationFn: async (changes) => updateMe(changes, await requireToken()),
    // Not retried: a write that may have succeeded is not a write to repeat
    // silently. The user can retry, and the screen will show the result.
    retry: false,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: apiQueryKeys.me });
    },
  });
}

/**
 * Deletes the account.
 *
 * Everything cached is dropped on success, because none of it describes anything
 * that still exists — the session ends as a consequence, and any screen left
 * holding a group list would be showing a deleted account's data.
 */
export function useDeleteAccount(): UseMutationResult<void, Error, void> {
  const queryClient = useQueryClient();

  return useMutation<void, Error, void>({
    mutationFn: async () => deleteAccount(await requireToken()),
    retry: false,
    onSuccess: () => {
      queryClient.clear();
    },
  });
}

/**
 * The caller's own feed: every event from every group their linked wallet is in.
 *
 * Polled, unlike the other index reads, because this is the screen that answers
 * "did it happen yet" after a member has just signed something. It is also the
 * one read here whose *empty* answer has two meanings — no linked wallet, or no
 * activity — so the screen reads `GET /me` alongside it to say which.
 */
export function useMyActivity(enabled = true) {
  return useInfiniteQuery({
    queryKey: apiQueryKeys.myActivity,
    enabled,
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }) =>
      listMyActivity({ limit: LEDGER_PAGE_SIZE, offset: pageParam }, await requireToken(), signal),
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.offset + lastPage.limit : undefined,
    retry: retryRead,
    refetchInterval: INDEX_STALE_TIME_MS,
  });
}

/**
 * Notifications, newest first.
 *
 * Polled on the same interval as the feed, because a notification exists to say
 * that something the feed shows has happened, and the two arriving together is
 * what makes the badge and the list agree.
 */
export function useNotifications(unreadOnly = false) {
  return useInfiniteQuery({
    queryKey: apiQueryKeys.notifications(unreadOnly),
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }) =>
      listNotifications(
        { unreadOnly, limit: PAGE_SIZE, offset: pageParam },
        await requireToken(),
        signal,
      ),
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.offset + lastPage.limit : undefined,
    retry: retryRead,
    refetchInterval: INDEX_STALE_TIME_MS,
  });
}

/** Marks one notification read, and refreshes the lists that show its state. */
export function useMarkNotificationRead(): UseMutationResult<void, Error, { id: string }> {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { id: string }>({
    mutationFn: async ({ id }) => markNotificationRead(id, await requireToken()),
    // Marking twice is safe at the API, so this is one of the few writes that
    // could be retried — but a retry here would only delay the click's feedback.
    retry: false,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: apiQueryKeys.allNotifications });
    },
  });
}

/**
 * Links a wallet to the account.
 *
 * The signing is supplied by the caller rather than imported, so this layer does
 * not depend on a wallet adapter — and so the whole flow can be exercised without
 * a browser extension. The three steps are one mutation because they are one
 * intention: a caller cannot usefully hold a nonce and not use it.
 *
 * Not retried, and the reason is the nonce: it is single-use and spent before the
 * binding is written, so a retry after a failure would be refused as a reuse. The
 * caller starts again, which is cheap.
 */
export function useLinkWallet(): UseMutationResult<
  LinkedWallet,
  Error,
  { address: string; signMessage(message: string): Promise<string> }
> {
  const queryClient = useQueryClient();

  return useMutation<
    LinkedWallet,
    Error,
    { address: string; signMessage(message: string): Promise<string> }
  >({
    mutationFn: async ({ address, signMessage }) => {
      const token = await requireToken();
      const issued = await requestWalletNonce(address, token);
      const signature = await signMessage(issued.message);
      return verifyWalletLink({ address, nonce: issued.nonce, signature }, token);
    },
    retry: false,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: apiQueryKeys.me });
    },
  });
}

// `isRetryableApiError` is used by callers that manage their own retries —
// screens polling for a transaction the indexer has not reached yet. Re-exported
// here so those screens import one module rather than three.
export { isRetryableApiError };
