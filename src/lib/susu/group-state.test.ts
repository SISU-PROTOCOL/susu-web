import { describe, expect, it } from 'vitest';
import type { GroupSummary } from '../api/groups';
import { roundSummary } from './group-state';

/**
 * A group as the index reports it, with only the fields the summary reads made
 * explicit. The rest are filled with values the summary must ignore, so that a
 * change which starts depending on them fails here rather than in production.
 */
function group(overrides: Partial<GroupSummary>): GroupSummary {
  return {
    contractId: `C${'A'.repeat(55)}`,
    factoryContractId: `C${'B'.repeat(55)}`,
    groupId: 1,
    creator: `G${'C'.repeat(55)}`,
    token: `C${'D'.repeat(55)}`,
    contributionAmount: '100000000',
    memberCapacity: 3,
    createdLedger: 1,
    status: 'open',
    memberCount: 0,
    currentRound: 0,
    completedRounds: 0,
    contributedTotal: '0',
    paidOutTotal: '0',
    feeTotal: '0',
    lastEventLedger: 0,
    ...overrides,
  };
}

describe('roundSummary', () => {
  it('counts the places left while a group is open', () => {
    expect(roundSummary(group({ status: 'open', memberCount: 1 }))).toBe('Waiting for 2 more');
  });

  it('says a full group can start rather than counting down to zero', () => {
    expect(roundSummary(group({ status: 'open', memberCount: 3 }))).toBe(
      'Every place is filled; it can start',
    );
  });

  it('treats an over-full group as full', () => {
    // The contract cannot produce this. If the index ever reports it, saying
    // "waiting for -1 more" would be worse than saying it is full.
    expect(roundSummary(group({ status: 'open', memberCount: 4 }))).toBe(
      'Every place is filled; it can start',
    );
  });

  it('reports the round in progress, not the number of rounds left', () => {
    expect(
      roundSummary(
        group({ status: 'active', memberCount: 3, currentRound: 2, completedRounds: 1 }),
      ),
    ).toBe('Round 2 of 3 · 1 paid out');
  });

  it('describes a completed group by its whole history', () => {
    expect(
      roundSummary(
        group({ status: 'completed', memberCount: 3, currentRound: 3, completedRounds: 3 }),
      ),
    ).toBe('All 3 rounds paid out');
  });

  it('never derives progress from currentRound for a group that has not started', () => {
    // A fresh group's currentRound is 0, and "Round 0 of 3" would be nonsense.
    expect(roundSummary(group({ status: 'open', currentRound: 0 }))).not.toContain('Round');
  });

  it('ignores money, which is not what it describes', () => {
    const base = roundSummary(group({ status: 'active', currentRound: 1, completedRounds: 0 }));
    const withTotals = roundSummary(
      group({
        status: 'active',
        currentRound: 1,
        completedRounds: 0,
        contributedTotal: '999999999',
        paidOutTotal: '500000000',
        feeTotal: '1000000',
      }),
    );
    expect(withTotals).toBe(base);
  });
});
