import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';
import { isRetryable, type InvocationFailure } from '../stellar/contract-errors';
import { useInvocationContext, useStellar } from '../stellar/hooks';
import {
  contribute,
  executePayout,
  joinGroup,
  readGroupSnapshot,
  readMemberPosition,
  readPayoutOrder,
  readRound,
  startGroup,
  type GroupActionResult,
  type GroupReads,
} from '../stellar/contracts/group';
import {
  createGroup,
  readFactoryConfig,
  readGroupAddress,
  readGroupCount,
  type CreateGroupInput,
  type CreateGroupOutcome,
} from '../stellar/contracts/factory';
import type { FactoryConfigView, GroupSnapshot, RoundSnapshot } from '../stellar/contracts/decode';

/**
 * Query and mutation bindings for chain state.
 *
 * Two conventions hold throughout, and both exist to keep the UI honest:
 *
 *   - A query's data is what the chain said. A contract refusal is an error
 *     carrying the decoded reason — never a substituted default value.
 *   - A mutation's *value* may be a refusal. `status: 'invalid'` means the
 *     contract rejected the call. It is not thrown, because it is a normal
 *     answer that belongs in the UI rather than in an error boundary.
 */

/** A read the contract refused, carrying the decoded reason. */
export class ChainReadError extends Error {
  readonly failure: InvocationFailure;

  constructor(failure: InvocationFailure) {
    super(failure.message);
    this.name = 'ChainReadError';
    this.failure = failure;
  }
}

/**
 * Retry policy for chain reads.
 *
 * A refusal that cannot change — `AlreadyContributed`, `GroupCompleted` — is not
 * retried: asking again produces the same answer and only delays showing the
 * reason. A transient or unexplained failure is retried, since those can
 * genuinely resolve.
 */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ChainReadError) return isRetryable(error.failure);
  return failureCount < 2;
}

type ReadResult<T> = { ok: true; value: T } | { ok: false; failure: InvocationFailure };

function unwrap<T>(result: ReadResult<T>): T {
  if (!result.ok) throw new ChainReadError(result.failure);
  return result.value;
}

export const queryKeys = {
  factoryConfig: ['factory', 'config'] as const,
  groupCount: ['factory', 'groupCount'] as const,
  groupAddress: (groupId: number) => ['factory', 'group', groupId] as const,
  group: (groupAddress: string) => ['group', groupAddress, 'snapshot'] as const,
  member: (groupAddress: string, address: string) =>
    ['group', groupAddress, 'member', address] as const,
  payoutOrder: (groupAddress: string) => ['group', groupAddress, 'payoutOrder'] as const,
  round: (groupAddress: string, round: number) => ['group', groupAddress, 'round', round] as const,
};

/** Reads the Factory configuration, including its pause state. */
export function useFactoryConfig() {
  const { server, network } = useStellar();
  return useQuery<FactoryConfigView>({
    queryKey: queryKeys.factoryConfig,
    queryFn: async () => unwrap(await readFactoryConfig(server, network.network)),
    retry: shouldRetry,
  });
}

/** Reads how many groups exist. */
export function useGroupCount() {
  const { server, network } = useStellar();
  return useQuery<number>({
    queryKey: queryKeys.groupCount,
    queryFn: async () => unwrap(await readGroupCount(server, network.network)),
    retry: shouldRetry,
  });
}

/** Resolves a numeric group id to the address of its contract. */
export function useGroupAddress(groupId: number | undefined) {
  const { server, network } = useStellar();
  return useQuery<string>({
    queryKey: queryKeys.groupAddress(groupId ?? -1),
    enabled: groupId !== undefined,
    queryFn: async () => {
      if (groupId === undefined) throw new Error('A group id is required.');
      return unwrap(await readGroupAddress(server, network.network, groupId));
    },
    retry: shouldRetry,
  });
}

function readsFor(
  server: GroupReads['server'],
  network: GroupReads['network'],
  groupAddress: string | undefined,
): GroupReads | undefined {
  if (groupAddress === undefined || groupAddress === '') return undefined;
  return { server, network, groupAddress };
}

/**
 * Reads a group's full state.
 *
 * Disabled without a group address rather than reading a placeholder, so a
 * screen can never render state that belongs to no group.
 */
export function useGroupSnapshot(groupAddress: string | undefined) {
  const { server, network } = useStellar();
  const reads = readsFor(server, network.network, groupAddress);

  return useQuery<GroupSnapshot>({
    queryKey: queryKeys.group(groupAddress ?? ''),
    enabled: reads !== undefined,
    queryFn: async () => {
      if (reads === undefined) throw new Error('A group address is required.');
      return unwrap(await readGroupSnapshot(reads));
    },
    retry: shouldRetry,
  });
}

/** Reads an account's position in a group, or `0` if it is not a member. */
export function useMemberPosition(groupAddress: string | undefined, address: string | undefined) {
  const { server, network } = useStellar();
  const reads = readsFor(server, network.network, groupAddress);

  return useQuery<number>({
    queryKey: queryKeys.member(groupAddress ?? '', address ?? ''),
    enabled: reads !== undefined && address !== undefined,
    queryFn: async () => {
      if (reads === undefined || address === undefined) {
        throw new Error('A group address and an account are required.');
      }
      return unwrap(await readMemberPosition(reads, address));
    },
    retry: shouldRetry,
  });
}

/** Reads the immutable payout order. */
export function usePayoutOrder(groupAddress: string | undefined) {
  const { server, network } = useStellar();
  const reads = readsFor(server, network.network, groupAddress);

  return useQuery<string[]>({
    queryKey: queryKeys.payoutOrder(groupAddress ?? ''),
    enabled: reads !== undefined,
    queryFn: async () => {
      if (reads === undefined) throw new Error('A group address is required.');
      return unwrap(await readPayoutOrder(reads));
    },
    retry: shouldRetry,
  });
}

/** Reads one round's state. A round that does not exist yet has no recipient. */
export function useRound(groupAddress: string | undefined, round: number) {
  const { server, network } = useStellar();
  const reads = readsFor(server, network.network, groupAddress);

  return useQuery<RoundSnapshot>({
    queryKey: queryKeys.round(groupAddress ?? '', round),
    enabled: reads !== undefined && round >= 1,
    queryFn: async () => {
      if (reads === undefined) throw new Error('A group address is required.');
      return unwrap(await readRound(reads, round));
    },
    retry: shouldRetry,
  });
}

/**
 * Invalidates everything a group mutation could have changed.
 *
 * Called after a confirmed action so screens re-read from the chain rather than
 * from an optimistic guess. The app never assumes what a transaction did; it
 * asks.
 */
function useRefreshGroup(groupAddress: string | undefined): () => Promise<void> {
  const client = useQueryClient();

  return async (): Promise<void> => {
    if (groupAddress === undefined) return;
    await Promise.all([
      client.invalidateQueries({ queryKey: queryKeys.group(groupAddress) }),
      client.invalidateQueries({ queryKey: queryKeys.payoutOrder(groupAddress) }),
      client.invalidateQueries({ queryKey: ['group', groupAddress, 'round'] }),
      client.invalidateQueries({ queryKey: ['group', groupAddress, 'member'] }),
      client.invalidateQueries({ queryKey: queryKeys.groupCount }),
    ]);
  };
}

/** Creates a group through the Factory. */
export function useCreateGroup(): UseMutationResult<CreateGroupOutcome, Error, CreateGroupInput> {
  const context = useInvocationContext();
  const client = useQueryClient();

  return useMutation<CreateGroupOutcome, Error, CreateGroupInput>({
    mutationFn: async (input) => {
      if (context === undefined) throw new Error('Connect a wallet before creating a group.');
      return createGroup(context, input);
    },
    onSuccess: async (outcome) => {
      if (outcome.status === 'created') {
        await client.invalidateQueries({ queryKey: queryKeys.groupCount });
      }
    },
  });
}

/** Joins the connected account to a group. Resolves with the position taken. */
export function useJoinGroup(
  groupAddress: string | undefined,
): UseMutationResult<GroupActionResult<number>, Error, void> {
  const context = useInvocationContext();
  const refresh = useRefreshGroup(groupAddress);

  return useMutation<GroupActionResult<number>, Error, void>({
    mutationFn: async () => {
      if (context === undefined) throw new Error('Connect a wallet before joining a group.');
      if (groupAddress === undefined) throw new Error('A group address is required.');
      return joinGroup(context, groupAddress);
    },
    onSuccess: async (outcome) => {
      if (outcome.status === 'confirmed') await refresh();
    },
  });
}

/** Starts a full group, moving it from Open to Active. */
export function useStartGroup(
  groupAddress: string | undefined,
): UseMutationResult<GroupActionResult<undefined>, Error, void> {
  const context = useInvocationContext();
  const refresh = useRefreshGroup(groupAddress);

  return useMutation<GroupActionResult<undefined>, Error, void>({
    mutationFn: async () => {
      if (context === undefined) throw new Error('Connect a wallet before starting a group.');
      if (groupAddress === undefined) throw new Error('A group address is required.');
      return startGroup(context, groupAddress);
    },
    onSuccess: async (outcome) => {
      if (outcome.status === 'confirmed') await refresh();
    },
  });
}

/** Contributes the exact configured amount to the current round. */
export function useContribute(
  groupAddress: string | undefined,
): UseMutationResult<GroupActionResult<undefined>, Error, { amount: bigint; round: number }> {
  const context = useInvocationContext();
  const refresh = useRefreshGroup(groupAddress);

  return useMutation<GroupActionResult<undefined>, Error, { amount: bigint; round: number }>({
    mutationFn: async ({ amount, round }) => {
      if (context === undefined) throw new Error('Connect a wallet before contributing.');
      if (groupAddress === undefined) throw new Error('A group address is required.');
      return contribute(context, groupAddress, amount, round);
    },
    onSuccess: async (outcome) => {
      if (outcome.status === 'confirmed') await refresh();
    },
  });
}

/**
 * Executes the payout for a fully funded round.
 *
 * Permissionless, but the contract still refuses an unfunded round. Calling it
 * early cannot move money early; it returns `ContributionsIncomplete`, which the
 * UI presents as the round still waiting.
 */
export function useExecutePayout(
  groupAddress: string | undefined,
): UseMutationResult<GroupActionResult<undefined>, Error, void> {
  const context = useInvocationContext();
  const refresh = useRefreshGroup(groupAddress);

  return useMutation<GroupActionResult<undefined>, Error, void>({
    mutationFn: async () => {
      if (context === undefined) throw new Error('Connect a wallet before executing a payout.');
      if (groupAddress === undefined) throw new Error('A group address is required.');
      return executePayout(context, groupAddress);
    },
    onSuccess: async (outcome) => {
      if (outcome.status === 'confirmed') await refresh();
    },
  });
}
