import { Address, nativeToScVal, scValToNative, xdr } from '@stellar/stellar-sdk';
import {
  invokeContract,
  readContract,
  type ContractServer,
  type InvocationNotConfirmed,
} from '../invoke';
import type { StellarNetwork } from '../network';
import { groupContract, type InvocationContext } from './factory';
import {
  decodeAddressList,
  decodeAmount,
  decodeCount,
  decodeGroupState,
  decodeRoundInfo,
} from './decode';

/**
 * Typed access to a deployed Group contract.
 *
 * The contract is the only authority on what a member may do. Nothing here
 * decides whether a contribution is allowed, whether a round is complete, or who
 * is paid — it reads those answers and encodes requests to change them. The
 * checks a screen performs exist to avoid a pointless signature prompt, not to
 * substitute for the contract's own rules.
 */

/** Identifies which group is being read. */
export interface GroupReads {
  readonly server: ContractServer;
  readonly network: StellarNetwork;
  readonly groupAddress: string;
}

function toAddress(value: string): xdr.ScVal {
  return new Address(value).toScVal();
}

/** Reads the full observable state of a group. */
export function readGroupSnapshot(reads: GroupReads) {
  return readContract(
    reads.server,
    reads.network,
    groupContract(reads.groupAddress),
    'get_group',
    [],
    decodeGroupState,
  );
}

/** Reads a member's 1-based position, or `0` if the address is not a member. */
export function readMemberPosition(reads: GroupReads, address: string) {
  return readContract(
    reads.server,
    reads.network,
    groupContract(reads.groupAddress),
    'get_member',
    [toAddress(address)],
    (native) => decodeCount(native, 'member'),
  );
}

/** Reads the immutable payout order. */
export function readPayoutOrder(reads: GroupReads) {
  return readContract(
    reads.server,
    reads.network,
    groupContract(reads.groupAddress),
    'get_payout_order',
    [],
    (native) => decodeAddressList(native, 'payout_order'),
  );
}

/** Reads the state of one round. A round that does not exist yet has no recipient. */
export function readRound(reads: GroupReads, round: number) {
  return readContract(
    reads.server,
    reads.network,
    groupContract(reads.groupAddress),
    'get_round',
    [nativeToScVal(round, { type: 'u32' })],
    decodeRoundInfo,
  );
}

/** Reads the contract's actual token balance, in stroops. */
export function readPoolBalance(reads: GroupReads) {
  return readContract(
    reads.server,
    reads.network,
    groupContract(reads.groupAddress),
    'get_pool_balance',
    [],
    (native) => decodeAmount(native, 'pool_balance'),
  );
}

/**
 * The result of a state-changing group action.
 *
 * `confirmed` is the only success, and it carries whatever the chain returned:
 * `undefined` for the methods that return nothing, and the position for `join`.
 */
export type GroupActionResult<T> =
  | {
      readonly status: 'confirmed';
      readonly value: T;
      readonly hash: string;
      readonly ledger: number;
    }
  | InvocationNotConfirmed;

/**
 * Invokes a Group method and reports the outcome.
 *
 * The return value is decoded only from a confirmed transaction. A method that
 * returns unit has nothing to decode, and synthesizing a value for it would
 * suggest the app knows more than the chain told it.
 */
async function invokeGroupMethod<T>(
  context: InvocationContext,
  groupAddress: string,
  method: string,
  args: readonly xdr.ScVal[],
  decodeReturn: (native: unknown) => T,
): Promise<GroupActionResult<T>> {
  const outcome = await invokeContract({
    server: context.server,
    network: context.network,
    wallet: context.wallet,
    sourceAddress: context.sourceAddress,
    contract: groupContract(groupAddress),
    method,
    args,
  });

  if (outcome.status !== 'confirmed') return outcome;

  if (outcome.returnValue === undefined) {
    return {
      status: 'invalid',
      failure: {
        kind: 'opaque',
        message: 'The transaction succeeded, but the network reported no result to read.',
        raw: `${method} confirmed without a return value`,
      },
    };
  }

  // Decoding happens after the transaction has already been confirmed, so a
  // failure here must not be thrown. Throwing would surface as a failed mutation
  // and tell the user their action did not happen when the chain has already
  // recorded that it did. Report it as an unreadable result instead, the same way
  // `createGroup` does, and keep the "confirmed but unknown" distinction visible.
  try {
    return {
      status: 'confirmed',
      value: decodeReturn(scValToNative(outcome.returnValue)),
      hash: outcome.hash,
      ledger: outcome.ledger,
    };
  } catch (cause) {
    return {
      status: 'invalid',
      failure: {
        kind: 'opaque',
        message: `${method} succeeded on-chain, but its result could not be read. Re-read the group before acting again.`,
        raw: cause instanceof Error ? cause.message : String(cause),
      },
    };
  }
}

/**
 * Joins the connected account to a group, returning its 1-based position.
 *
 * The member argument is always the connected account. The contract requires the
 * member's own authorization, so passing any other address could only produce a
 * transaction the wallet is unable to authorize.
 */
export function joinGroup(
  context: InvocationContext,
  groupAddress: string,
): Promise<GroupActionResult<number>> {
  return invokeGroupMethod(
    context,
    groupAddress,
    'join',
    joinArgs(context.sourceAddress),
    (native) => decodeCount(native, 'position'),
  );
}

/**
 * Encodes `join(member)` arguments.
 *
 * Exported so tests can assert the encoding without a network, mirroring
 * `createGroupArgs`, since an encoding mistake here would only be discovered by
 * a rejected transaction.
 */
export function joinArgs(member: string): xdr.ScVal[] {
  return [toAddress(member)];
}

/** Starts a full group, moving it from Open to Active. */
export function startGroup(
  context: InvocationContext,
  groupAddress: string,
): Promise<GroupActionResult<undefined>> {
  return invokeGroupMethod(context, groupAddress, 'start', [], () => undefined);
}

/**
 * Contributes to the current round.
 *
 * Both the amount and the round are supplied explicitly because the contract
 * requires them to be exact: the amount must equal the configured contribution,
 * and the round must be the current one. Passing what was just read means a
 * round that advanced in the meantime is rejected by the contract rather than
 * silently contributing to the wrong round.
 */
/**
 * Encodes `contribute(member, amount, round)` arguments.
 *
 * Exported for the same reason as `createGroupArgs`: the amount must be an `i128`
 * and the round a `u32`, and a mismatch would be caught by the contract only
 * after the user had been asked to sign.
 */
export function contributeArgs(member: string, amount: bigint, round: number): xdr.ScVal[] {
  return [
    toAddress(member),
    nativeToScVal(amount, { type: 'i128' }),
    nativeToScVal(round, { type: 'u32' }),
  ];
}

export function contribute(
  context: InvocationContext,
  groupAddress: string,
  amount: bigint,
  round: number,
): Promise<GroupActionResult<undefined>> {
  return invokeGroupMethod(
    context,
    groupAddress,
    'contribute',
    contributeArgs(context.sourceAddress, amount, round),
    () => undefined,
  );
}

/**
 * Executes the payout for a fully funded round.
 *
 * Permissionless: any member may call it once every contribution is in, and the
 * contract still refuses if the round is not funded. Calling it early cannot
 * move money early — it returns `ContributionsIncomplete`, which the UI presents
 * as the round still waiting rather than as a failure.
 */
export function executePayout(
  context: InvocationContext,
  groupAddress: string,
): Promise<GroupActionResult<undefined>> {
  return invokeGroupMethod(context, groupAddress, 'execute_payout', [], () => undefined);
}
