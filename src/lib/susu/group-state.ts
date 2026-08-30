import type { GroupSummary } from '../api/groups';

/**
 * Describing a group's state in one line.
 *
 * Separate from the component that renders it so the wording and the arithmetic
 * can be tested without a DOM, and so the same sentence can be used wherever a
 * group's progress is summarised. The card is not the only place a member needs
 * to know how far along a group is.
 *
 * The three states are described separately rather than by arithmetic on
 * `currentRound`, because a group that has not started has no current round and a
 * group that has finished has no next one — and `currentRound` alone cannot tell
 * those two apart from a group mid-life.
 *
 * The numbers come from the index and can lag the chain by up to one indexing
 * run. That is why every summary is a description of progress rather than an
 * instruction: nothing here should be read as "you may now contribute".
 */
export function roundSummary(group: GroupSummary): string {
  switch (group.status) {
    case 'open': {
      const remaining = group.memberCapacity - group.memberCount;
      return remaining <= 0
        ? 'Every place is filled; it can start'
        : `Waiting for ${remaining} more`;
    }
    case 'active':
      return `Round ${group.currentRound} of ${group.memberCapacity} · ${group.completedRounds} paid out`;
    case 'completed':
      return `All ${group.memberCapacity} rounds paid out`;
  }
}
