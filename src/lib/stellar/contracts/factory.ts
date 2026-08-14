import { Address, Contract, nativeToScVal, scValToNative, xdr } from '@stellar/stellar-sdk';
import { getFactoryContract } from '../client';
import type { StellarNetwork } from '../network';
import {
  invokeContract,
  readContract,
  type ContractServer,
  type InvocationNotConfirmed,
} from '../invoke';
import type { WalletAdapter } from '../../wallet';
import {
  decodeContractAddress,
  decodeCount,
  decodeFactoryConfig,
  type FactoryConfigView,
} from './decode';

/**
 * Typed access to the Factory contract.
 *
 * Every argument is converted here rather than at the call site, so the encoding
 * for a given parameter exists in exactly one place. A `u32` encoded as an `i128`
 * would be rejected by the contract, but only after the user had been asked to
 * sign, so getting it right here is a user-facing concern and not just tidiness.
 */

/** The Factory's address, resolved from validated configuration. */
export function factoryContract(): Contract {
  return getFactoryContract();
}

/** A handle for a deployed Group, addressed by its contract id. */
export function groupContract(address: string): Contract {
  return new Contract(address);
}

/** Everything a state-changing call needs, minus the specifics of the call. */
export interface InvocationContext {
  readonly server: ContractServer;
  readonly network: StellarNetwork;
  readonly wallet: WalletAdapter;
  /** The connected account: the transaction source, and the signer. */
  readonly sourceAddress: string;
}

function toAddress(value: string): xdr.ScVal {
  return new Address(value).toScVal();
}

/** Arguments for `create_group(creator, token, contribution_amount, member_capacity, frequency_seconds)`. */
export interface CreateGroupInput {
  readonly creator: string;
  readonly token: string;
  readonly contributionAmount: bigint;
  readonly memberCapacity: number;
  readonly frequencySeconds: bigint;
}

/**
 * Encodes `create_group` arguments.
 *
 * Exported so tests can assert the encoding without a network, since an encoding
 * mistake here would be discovered only by a rejected transaction.
 */
export function createGroupArgs(input: CreateGroupInput): xdr.ScVal[] {
  return [
    toAddress(input.creator),
    toAddress(input.token),
    nativeToScVal(input.contributionAmount, { type: 'i128' }),
    nativeToScVal(input.memberCapacity, { type: 'u32' }),
    nativeToScVal(input.frequencySeconds, { type: 'u64' }),
  ];
}

/** A group was deployed. */
export interface GroupCreated {
  readonly status: 'created';
  /** The address of the newly deployed Group contract, read back from the ledger. */
  readonly groupAddress: string;
  readonly hash: string;
  readonly ledger: number;
}

/** The call did not deploy a group; carry the reason through unchanged. */
export type CreateGroupOutcome = GroupCreated | InvocationNotConfirmed;

/**
 * Deploys a group through the Factory.
 *
 * The new group's address comes from the ledger's record of the confirmed
 * transaction, never from a locally computed expectation. A group id read before
 * the call would be a guess, and another creator could take it in between, so
 * the address is taken only from what the chain actually did.
 */
export async function createGroup(
  context: InvocationContext,
  input: CreateGroupInput,
): Promise<CreateGroupOutcome> {
  const outcome = await invokeContract({
    server: context.server,
    network: context.network,
    wallet: context.wallet,
    sourceAddress: context.sourceAddress,
    contract: factoryContract(),
    method: 'create_group',
    args: createGroupArgs(input),
  });

  if (outcome.status !== 'confirmed') return outcome;

  if (outcome.returnValue === undefined) {
    return {
      status: 'invalid',
      failure: {
        kind: 'opaque',
        message:
          'The group was created, but the network did not report which contract was deployed. Check your groups before creating another.',
        raw: 'create_group confirmed without a return value',
      },
    };
  }

  try {
    return {
      status: 'created',
      groupAddress: decodeContractAddress(
        scValToNative(outcome.returnValue),
        'create_group result',
      ),
      hash: outcome.hash,
      ledger: outcome.ledger,
    };
  } catch (cause) {
    return {
      status: 'invalid',
      failure: {
        kind: 'opaque',
        message:
          'The group was created, but its address could not be read from the network response.',
        raw: cause instanceof Error ? cause.message : String(cause),
      },
    };
  }
}

/** Reads the Factory's current configuration. */
export async function readFactoryConfig(
  server: ContractServer,
  network: StellarNetwork,
): ReturnType<typeof readContract<FactoryConfigView>> {
  return readContract(server, network, factoryContract(), 'get_config', [], decodeFactoryConfig);
}

/** Reads the number of groups created. Also the most recently assigned group id. */
export async function readGroupCount(
  server: ContractServer,
  network: StellarNetwork,
): ReturnType<typeof readContract<number>> {
  return readContract(server, network, factoryContract(), 'get_group_count', [], (native) =>
    decodeCount(native, 'group_count'),
  );
}

/** Resolves a group id to the address of its deployed contract. */
export async function readGroupAddress(
  server: ContractServer,
  network: StellarNetwork,
  groupId: number,
): ReturnType<typeof readContract<string>> {
  return readContract(
    server,
    network,
    factoryContract(),
    'get_group',
    [nativeToScVal(groupId, { type: 'u32' })],
    (native) => decodeContractAddress(native, 'group'),
  );
}
