/**
 * Contract error decoding.
 *
 * The contracts return `Result<_, ContractError>` rather than panicking, so a
 * rejected call is a normal, expected outcome — "you already contributed",
 * "the round is not fully funded yet" — not a crash. Soroban surfaces that
 * outcome in two different shapes depending on where it happened, and both are
 * decoded here:
 *
 *   - Simulation rejected the call before submission. The RPC returns a host
 *     error string containing `Error(Contract, #N)`.
 *   - The transaction was submitted and applied, but failed. The failure is in
 *     the result XDR.
 *
 * Anything unrecognized is reported as opaque rather than guessed at. A wrong
 * explanation of a failed financial transaction is worse than none.
 */

/** Every `GroupError` variant name, matching the contract's declaration order. */
export type GroupErrorName =
  | 'InvalidContributionAmount'
  | 'InvalidMemberCapacity'
  | 'InvalidFeeBps'
  | 'InvalidFrequency'
  | 'NotOpen'
  | 'AlreadyMember'
  | 'GroupFull'
  | 'CapacityNotReached'
  | 'NotActive'
  | 'NotAMember'
  | 'WrongRound'
  | 'WrongAmount'
  | 'AlreadyContributed'
  | 'ContributionsIncomplete'
  | 'PayoutAlreadyExecuted'
  | 'WrongRoundPhase'
  | 'GroupCompleted'
  | 'ArithmeticOverflow'
  | 'SplitInvariantViolated';

/** Every `FactoryError` variant name, matching the contract's declaration order. */
export type FactoryErrorName =
  | 'InvalidFeeBps'
  | 'InvalidContributionAmount'
  | 'InvalidMemberCapacity'
  | 'InvalidFrequency'
  | 'Paused'
  | 'GroupNotFound'
  | 'ArithmeticOverflow';

/**
 * `GroupError` discriminator values, as returned on-chain.
 *
 * These mirror the contract's enum exactly; a mismatch here would mislabel a
 * rejected transaction, so they are asserted directly against the spec in tests.
 */
export const GROUP_ERRORS: Readonly<Record<number, GroupErrorName>> = {
  1: 'InvalidContributionAmount',
  2: 'InvalidMemberCapacity',
  3: 'InvalidFeeBps',
  4: 'InvalidFrequency',
  5: 'NotOpen',
  6: 'AlreadyMember',
  7: 'GroupFull',
  8: 'CapacityNotReached',
  9: 'NotActive',
  10: 'NotAMember',
  11: 'WrongRound',
  12: 'WrongAmount',
  13: 'AlreadyContributed',
  14: 'ContributionsIncomplete',
  15: 'PayoutAlreadyExecuted',
  16: 'WrongRoundPhase',
  17: 'GroupCompleted',
  18: 'ArithmeticOverflow',
  19: 'SplitInvariantViolated',
};

/** `FactoryError` discriminator values, as returned on-chain. */
export const FACTORY_ERRORS: Readonly<Record<number, FactoryErrorName>> = {
  1: 'InvalidFeeBps',
  2: 'InvalidContributionAmount',
  3: 'InvalidMemberCapacity',
  4: 'InvalidFrequency',
  5: 'Paused',
  6: 'GroupNotFound',
  7: 'ArithmeticOverflow',
};

/**
 * What to tell the user, per error.
 *
 * These deliberately state what is true of the protocol rather than blaming the
 * user. `ContributionsIncomplete` in particular is the WAIT rule working as
 * designed — no member is skipped and no payout is early — so it is phrased as a
 * status, not a failure.
 */
const GROUP_MESSAGES: Record<GroupErrorName, string> = {
  InvalidContributionAmount: 'This contribution amount is not valid.',
  InvalidMemberCapacity: 'A group must have between 2 and 100 members.',
  InvalidFeeBps: 'The protocol fee is outside the permitted range.',
  InvalidFrequency: 'The contribution frequency is not valid.',
  NotOpen: 'This group has already started and is no longer accepting members.',
  AlreadyMember: 'You have already joined this group.',
  GroupFull: 'This group is full.',
  CapacityNotReached: 'This group cannot start until every place is filled.',
  NotActive: 'This group is not currently running.',
  NotAMember: 'You are not a member of this group.',
  WrongRound: 'This round has already moved on. Refresh to see the current round.',
  WrongAmount: "The amount does not match this group's contribution amount.",
  AlreadyContributed: 'You have already contributed to this round.',
  ContributionsIncomplete:
    'Not everyone has contributed yet. The round waits for all members — nobody is skipped.',
  PayoutAlreadyExecuted: 'This round has already been paid out.',
  WrongRoundPhase: 'This round is not in a state where that action is possible.',
  GroupCompleted: 'This group has completed all of its rounds.',
  ArithmeticOverflow: 'The amounts involved are too large to be processed safely.',
  SplitInvariantViolated:
    'The payout could not be split correctly, so it was refused rather than paid out incorrectly.',
};

const FACTORY_MESSAGES: Record<FactoryErrorName, string> = {
  InvalidFeeBps: 'The protocol fee is outside the permitted range.',
  InvalidContributionAmount: 'This contribution amount is not valid.',
  InvalidMemberCapacity: 'A group must have between 2 and 100 members.',
  InvalidFrequency: 'The contribution frequency is not valid.',
  Paused: 'New group creation is paused. Existing groups are unaffected.',
  GroupNotFound: 'That group does not exist.',
  ArithmeticOverflow: 'The amounts involved are too large to be processed safely.',
};

/** Which contract produced an error, and therefore which table to decode against. */
export type ContractKind = 'group' | 'factory';

/** A contract deliberately returned an error. */
export interface ContractErrorFailure {
  readonly kind: 'contract-error';
  readonly contract: ContractKind;
  readonly code: number;
  readonly name: string;
  readonly message: string;
}

/**
 * The call did not reach a contract result we can explain.
 *
 * Kept separate from `contract-error` so the UI never presents a network or
 * configuration problem as a rules rejection.
 */
export interface OpaqueFailure {
  readonly kind: 'opaque';
  readonly message: string;
  readonly raw: string;
}

export type InvocationFailure = ContractErrorFailure | OpaqueFailure;

/** Matches the `Error(Contract, #N)` form the Soroban host emits. */
const CONTRACT_ERROR_PATTERN = /Error\(Contract,\s*#(\d+)\)/;

/**
 * Extracts the contract error code from a host error string, or `null`.
 *
 * Exported because the exact wording of host errors varies between SDK and
 * network versions; keeping the extraction in one place means only one thing has
 * to be adjusted if it changes.
 */
export function extractContractErrorCode(raw: string): number | null {
  const match = CONTRACT_ERROR_PATTERN.exec(raw);
  if (match?.[1] === undefined) return null;

  const code = Number.parseInt(match[1], 10);
  return Number.isSafeInteger(code) ? code : null;
}

function nameFor(contract: ContractKind, code: number): string | undefined {
  return contract === 'group' ? GROUP_ERRORS[code] : FACTORY_ERRORS[code];
}

function messageFor(contract: ContractKind, name: string): string | undefined {
  if (contract === 'group') {
    return GROUP_MESSAGES[name as GroupErrorName];
  }
  return FACTORY_MESSAGES[name as FactoryErrorName];
}

/**
 * Turns a raw failure into something a person can read.
 *
 * `contract` selects the error table, since codes are per-contract and code 5
 * means `NotOpen` for a group but `Paused` for the Factory. A code with no entry
 * in the table is still reported as a contract error — the code is the
 * contract's own, and inventing a name for an unknown one would be a lie.
 */
export function describeFailure(raw: string, contract: ContractKind): InvocationFailure {
  const code = extractContractErrorCode(raw);

  if (code === null) {
    return {
      kind: 'opaque',
      message:
        'The network did not accept this transaction. It may have been rejected before it reached the contract.',
      raw,
    };
  }

  const name = nameFor(contract, code);
  if (name === undefined) {
    return {
      kind: 'contract-error',
      contract,
      code,
      name: `UnknownError${code}`,
      message: `The contract refused this action (error ${code}).`,
    };
  }

  return {
    kind: 'contract-error',
    contract,
    code,
    name,
    message: messageFor(contract, name) ?? `The contract refused this action (error ${code}).`,
  };
}

/**
 * Whether retrying the same call could plausibly succeed.
 *
 * `ContributionsIncomplete` is retryable because other members may still
 * contribute. Rules rejections such as `AlreadyContributed` or `GroupCompleted`
 * are not: repeating them will produce the same answer, so offering a retry
 * would be busywork.
 */
export function isRetryable(failure: InvocationFailure): boolean {
  if (failure.kind === 'opaque') return true;

  const { contract, name } = failure;
  if (contract === 'group') {
    return (
      name === 'ContributionsIncomplete' ||
      name === 'WrongRound' ||
      name === 'CapacityNotReached' ||
      name === 'WrongRoundPhase'
    );
  }

  return name === 'Paused';
}
