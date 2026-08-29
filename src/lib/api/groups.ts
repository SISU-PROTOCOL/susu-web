/**
 * The indexed view of groups, contributions, payouts and transactions.
 *
 * WHAT THIS IS, AND WHAT IT IS NOT
 * These reads come from `susu-api`, which serves the `susu-indexer`'s tables. The
 * index is derived from the chain and lags it by up to one indexing run, so a
 * value here is a *report* of what the contracts did, not the contracts' current
 * state.
 *
 * That distinction decides where each read belongs. Discovery — "which groups
 * exist", "which ones am I in" — can only come from an index: the chain has no
 * way to list groups belonging to an address, and finding them by walking every
 * id is a scan that is wrong at any real size. State that a decision depends on —
 * "may I contribute", "is this round payable" — is read from the contract, by
 * `lib/susu`, because a stale answer there would prompt a signature the contract
 * then refuses.
 *
 * So: this module answers "what does the protocol say happened", never "what
 * should I sign".
 *
 * MONEY IS BASE UNITS, AS A STRING
 * Every amount is an integer count of the token's smallest unit, carried as a
 * string. The API selects these columns with `::text` for exactly this reason —
 * `numeric` does not survive a trip through a JavaScript number — and parsing one
 * into a number here would undo that at the last step. Formatting is
 * `formatUsdc`'s job.
 */
import { apiRequest, apiRequestPage, type ApiPage } from './client';

/** The statuses the contract uses. Not an open set: the API rejects others. */
export type GroupStatus = 'open' | 'active' | 'completed';

export type GroupSummary = {
  readonly contractId: string;
  readonly factoryContractId: string;
  /** The factory's sequential id, unique per factory. */
  readonly groupId: number;
  readonly creator: string;
  /** The SAC the group settles in — recorded, not assumed to be USDC. */
  readonly token: string;
  /** Base units, as a string. */
  readonly contributionAmount: string;
  readonly memberCapacity: number;
  readonly createdLedger: number;
  readonly status: GroupStatus;
  readonly memberCount: number;
  readonly currentRound: number;
  readonly completedRounds: number;
  /** Base units, as a string. */
  readonly contributedTotal: string;
  readonly paidOutTotal: string;
  readonly feeTotal: string;
  /** The highest ledger any of this group's events came from; 0 before any. */
  readonly lastEventLedger: number;
};

export type GroupMember = {
  readonly member: string;
  /** 1-based join order, as the contract assigned it. */
  readonly position: number;
  readonly joinedLedger: number;
};

export type GroupRound = {
  readonly round: number;
  readonly contributionCount: number;
  /** Base units contributed this round, as a string. */
  readonly contributed: string;
  /** Base units paid out, or `null` if the round has not paid. */
  readonly payout: string | null;
  readonly recipient: string | null;
  readonly fee: string | null;
};

export type GroupDetail = GroupSummary & {
  readonly members: readonly GroupMember[];
  readonly rounds: readonly GroupRound[];
};

export type ContributionRecord = {
  readonly eventIdentity: string;
  readonly member: string;
  readonly round: number;
  /** Base units, as a string. */
  readonly amount: string;
  readonly ledger: number;
  readonly txHash: string;
};

export type PayoutRecord = {
  readonly eventIdentity: string;
  readonly recipient: string;
  readonly round: number;
  /** Base units, net of the protocol fee, as a string. */
  readonly recipientAmount: string;
  readonly ledger: number;
  readonly txHash: string;
};

export type ActivityRecord = {
  readonly eventIdentity: string;
  readonly name: string;
  readonly ledger: number;
  readonly txIndex: number;
  readonly eventIndex: number;
  readonly txHash: string;
  /** The decoded fields, exactly as the indexer's decoder produced them. */
  readonly payload: unknown;
};

export type TransactionEvent = {
  readonly eventIdentity: string;
  /** The decoded event name. */
  readonly name: string;
  /** The contract that emitted it, so a multi-contract transaction reads. */
  readonly contractId: string;
  readonly eventIndex: number;
  readonly payload: unknown;
};

export type TransactionReceipt = {
  readonly txHash: string;
  readonly ledger: number;
  readonly txIndex: number;
  /** In the order the contract emitted them. */
  readonly events: readonly TransactionEvent[];
};

export type ListGroupsQuery = {
  readonly status?: GroupStatus;
  readonly member?: string;
  readonly creator?: string;
  readonly limit?: number;
  readonly offset?: number;
};

/**
 * Removes absent filters rather than serialising them.
 *
 * `?member=undefined` would fail the API's address check and turn "no filter"
 * into a 400, which is a confusing way to say "I did not ask for one".
 */
function queryString(params: Readonly<Record<string, string | number | undefined>>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded === '' ? '' : `?${encoded}`;
}

function pageParams(page: { limit?: number; offset?: number }): {
  limit: number | undefined;
  offset: number | undefined;
} {
  return { limit: page.limit, offset: page.offset };
}

/**
 * Lists groups, optionally filtered.
 *
 * `member` is how a caller asks for one account's groups. It is resolved by the
 * API against the indexed membership rows, which is the only place that mapping
 * exists.
 */
export async function listGroups(
  query: ListGroupsQuery = {},
  signal?: AbortSignal,
): Promise<ApiPage<GroupSummary>> {
  const search = queryString({
    status: query.status,
    member: query.member,
    creator: query.creator,
    ...pageParams(query),
  });
  return apiRequestPage<GroupSummary>(`groups${search}`, { ...(signal ? { signal } : {}) });
}

/**
 * Reads one group, including its members and per-round totals.
 *
 * Answers 404 for a group the index has never seen — which includes an address
 * that is not a group at all. Callers that need to distinguish "unknown" from
 * "known but empty" can, but for rendering either is a dead end.
 */
export async function getGroup(contractId: string, signal?: AbortSignal): Promise<GroupDetail> {
  return apiRequest<GroupDetail>(`groups/${encodeURIComponent(contractId)}`, {
    ...(signal ? { signal } : {}),
  });
}

/** Lists the contribution events recorded for one group, oldest round first. */
export async function listContributions(
  contractId: string,
  page: { limit?: number; offset?: number } = {},
  signal?: AbortSignal,
): Promise<ApiPage<ContributionRecord>> {
  const search = queryString(pageParams(page));
  return apiRequestPage<ContributionRecord>(
    `groups/${encodeURIComponent(contractId)}/contributions${search}`,
    { ...(signal ? { signal } : {}) },
  );
}

/** Lists the payouts recorded for one group, oldest round first. */
export async function listPayouts(
  contractId: string,
  page: { limit?: number; offset?: number } = {},
  signal?: AbortSignal,
): Promise<ApiPage<PayoutRecord>> {
  const search = queryString(pageParams(page));
  return apiRequestPage<PayoutRecord>(`groups/${encodeURIComponent(contractId)}/payouts${search}`, {
    ...(signal ? { signal } : {}),
  });
}

/** Lists every decoded event recorded for one group, in ledger order. */
export async function listActivity(
  contractId: string,
  page: { limit?: number; offset?: number } = {},
  signal?: AbortSignal,
): Promise<ApiPage<ActivityRecord>> {
  const search = queryString(pageParams(page));
  return apiRequestPage<ActivityRecord>(
    `groups/${encodeURIComponent(contractId)}/activity${search}`,
    { ...(signal ? { signal } : {}) },
  );
}

/**
 * Reads the protocol's record of one transaction.
 *
 * EVENTUAL, AND THE CALLER MUST KNOW IT
 * The indexer runs on a schedule, so for a transaction that was just confirmed
 * this answers 404 until the next run reaches it. A 404 therefore means *either*
 * "no Susu contract was touched" or "not indexed yet", and a screen polling after
 * a submission must keep polling rather than reporting that nothing happened.
 * `isRetryableApiError` is false for 404 in general, so a poller here decides for
 * itself; see `useTransactionReceipt`.
 */
export async function getTransactionReceipt(
  txHash: string,
  signal?: AbortSignal,
): Promise<TransactionReceipt> {
  return apiRequest<TransactionReceipt>(`transactions/${encodeURIComponent(txHash)}`, {
    ...(signal ? { signal } : {}),
  });
}

/** Whether a string is a 32-byte transaction hash, as the RPC reports it. */
export function looksLikeTransactionHash(value: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(value);
}
