import { describe, expect, it } from 'vitest';
import {
  FACTORY_ERRORS,
  GROUP_ERRORS,
  describeFailure,
  extractContractErrorCode,
  isRetryable,
  type ContractErrorFailure,
} from './contract-errors';

/**
 * Wraps a code the way the Soroban host does inside a simulation error string.
 *
 * The surrounding text is copied from a real rejected invocation, because the
 * point of these tests is that decoding works against what the network actually
 * sends, not against a tidy string of our own invention.
 */
function hostError(code: number): string {
  return [
    `HostError: Error(Contract, #${code})`,
    '',
    'Event log (newest first):',
    `   0: [Diagnostic Event] topics:[error, Error(Contract, #${code})], data:["failed"]`,
    '   1: [Diagnostic Event] contract:CBQK, topics:[fn_call, CBQK, contribute]',
  ].join('\n');
}

function asContractError(failure: ReturnType<typeof describeFailure>): ContractErrorFailure {
  if (failure.kind !== 'contract-error') {
    throw new Error(`Expected a contract error, got ${failure.kind}`);
  }
  return failure;
}

describe('error tables', () => {
  it('matches the GroupError discriminators in CONTRACT_SPEC.md', () => {
    expect(GROUP_ERRORS).toEqual({
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
    });
  });

  it('matches the FactoryError discriminators in CONTRACT_SPEC.md', () => {
    expect(FACTORY_ERRORS).toEqual({
      1: 'InvalidFeeBps',
      2: 'InvalidContributionAmount',
      3: 'InvalidMemberCapacity',
      4: 'InvalidFrequency',
      5: 'Paused',
      6: 'GroupNotFound',
      7: 'ArithmeticOverflow',
    });
  });

  it('covers every code from 1 to the declared maximum with no gaps', () => {
    for (let code = 1; code <= 19; code += 1) {
      expect(GROUP_ERRORS[code], `group code ${code}`).toBeDefined();
    }
    for (let code = 1; code <= 7; code += 1) {
      expect(FACTORY_ERRORS[code], `factory code ${code}`).toBeDefined();
    }
  });
});

describe('extractContractErrorCode', () => {
  it('finds the code in a real host error string', () => {
    expect(extractContractErrorCode(hostError(13))).toBe(13);
  });

  it('handles surrounding whitespace in the parenthesised form', () => {
    expect(extractContractErrorCode('Error(Contract,  #7)')).toBe(7);
  });

  it('returns null for a host error that is not a contract error', () => {
    expect(extractContractErrorCode('HostError: Error(WasmVm, InvalidAction)')).toBeNull();
    expect(extractContractErrorCode('HostError: Error(Auth, InvalidAction)')).toBeNull();
  });

  it('returns null for unrelated text', () => {
    expect(extractContractErrorCode('')).toBeNull();
    expect(extractContractErrorCode('network timeout')).toBeNull();
    expect(extractContractErrorCode('Error(Contract, #)')).toBeNull();
  });
});

describe('describeFailure', () => {
  it('names and explains a known group error', () => {
    const failure = asContractError(describeFailure(hostError(13), 'group'));
    expect(failure.name).toBe('AlreadyContributed');
    expect(failure.message).toContain('already contributed');
  });

  it('decodes the same code differently per contract', () => {
    // Code 5 is the trap: NotOpen for a group, Paused for the Factory. Reading
    // the wrong table would tell the user the wrong thing entirely.
    expect(asContractError(describeFailure(hostError(5), 'group')).name).toBe('NotOpen');
    expect(asContractError(describeFailure(hostError(5), 'factory')).name).toBe('Paused');
  });

  it('presents the WAIT rule as a status rather than a fault', () => {
    const failure = asContractError(describeFailure(hostError(14), 'group'));
    expect(failure.name).toBe('ContributionsIncomplete');
    expect(failure.message).toMatch(/waits/i);
    expect(failure.message).toMatch(/nobody is skipped/i);
    expect(isRetryable(failure)).toBe(true);
  });

  it('reports an unmapped code without inventing a name for it', () => {
    const failure = asContractError(describeFailure(hostError(99), 'group'));
    expect(failure.code).toBe(99);
    expect(failure.name).toBe('UnknownError99');
  });

  it('never presents an unexplained failure as a contract error', () => {
    const failure = describeFailure('HostError: Error(WasmVm, InvalidAction)', 'group');
    expect(failure.kind).toBe('opaque');
    if (failure.kind === 'opaque') {
      expect(failure.raw).toContain('WasmVm');
    }
  });
});

describe('isRetryable', () => {
  it('allows a retry when waiting could still resolve', () => {
    expect(isRetryable(describeFailure(hostError(14), 'group'))).toBe(true);
    expect(isRetryable(describeFailure(hostError(8), 'group'))).toBe(true);
    expect(isRetryable(describeFailure(hostError(11), 'group'))).toBe(true);
  });

  it('does not offer a retry for a decision that will not change', () => {
    expect(isRetryable(describeFailure(hostError(13), 'group'))).toBe(false);
    expect(isRetryable(describeFailure(hostError(17), 'group'))).toBe(false);
    expect(isRetryable(describeFailure(hostError(6), 'group'))).toBe(false);
    expect(isRetryable(describeFailure(hostError(12), 'group'))).toBe(false);
  });

  it('treats an unexplained failure as worth retrying', () => {
    expect(isRetryable(describeFailure('socket hang up', 'group'))).toBe(true);
  });
});
