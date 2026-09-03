import { describe, expect, it } from 'vitest';
import { describeEvent } from './events';

const MEMBER = `G${'A'.repeat(55)}`;
const RECIPIENT = `G${'B'.repeat(55)}`;
const TREASURY = `G${'C'.repeat(55)}`;

describe('describeEvent', () => {
  it('names a contribution, its payer, and the amount in base units', () => {
    expect(describeEvent('contribution', { member: MEMBER, round: 3, amount: '50000000' })).toEqual(
      {
        title: 'Contribution',
        address: MEMBER,
        amount: '50000000',
        detail: 'round 3',
      },
    );
  });

  it('names a payout as net of the fee, because that is what the event carries', () => {
    expect(
      describeEvent('payout', { recipient: RECIPIENT, round: 2, recipientAmount: '49750000' }),
    ).toEqual({
      title: 'Payout',
      address: RECIPIENT,
      amount: '49750000',
      detail: 'round 2 · net of fee',
    });
  });

  it('shows the fee as its own event rather than folding it into the payout', () => {
    expect(describeEvent('fee', { treasury: TREASURY, round: 2, fee: '250000' })).toEqual({
      title: 'Protocol fee',
      address: TREASURY,
      amount: '250000',
      detail: 'round 2',
    });
  });

  it('reports a join with the position the contract assigned', () => {
    expect(describeEvent('join', { member: MEMBER, position: 0 })).toEqual({
      title: 'Member joined',
      address: MEMBER,
      detail: 'position 0',
    });
  });

  it('reports the start, completion and creation of a group', () => {
    expect(describeEvent('start', { memberCount: 5 })).toEqual({
      title: 'Group started',
      detail: '5 members',
    });
    expect(describeEvent('completed', { rounds: 5 })).toEqual({
      title: 'Group completed',
      detail: '5 rounds paid out',
    });
    expect(describeEvent('group_created', { creator: MEMBER, memberCapacity: 5 })).toEqual({
      title: 'Group created',
      address: MEMBER,
      detail: 'capacity 5',
    });
  });

  it('reports factory administration, where the fee is in basis points', () => {
    expect(describeEvent('fee_updated', { feeBps: 50 })).toEqual({
      title: 'Protocol fee changed',
      detail: '0.5%',
    });
    expect(describeEvent('treasury_updated', { treasury: TREASURY })).toEqual({
      title: 'Treasury changed',
      address: TREASURY,
    });
    expect(describeEvent('pause_updated', { paused: true })).toEqual({
      title: 'Group creation paused',
    });
    expect(describeEvent('pause_updated', { paused: false })).toEqual({
      title: 'Group creation resumed',
    });
  });

  it('keeps amounts as strings, never as numbers', () => {
    // An i128 does not fit a JSON number. Anything that round-trips through one
    // has already lost whatever the chain recorded.
    const described = describeEvent('contribution', {
      member: MEMBER,
      round: 1,
      amount: '170141183460469231731687303715884105727',
    });

    expect(described.amount).toBe('170141183460469231731687303715884105727');
    expect(typeof described.amount).toBe('string');
  });

  it('renders an unknown event rather than dropping it', () => {
    // A contract upgrade that adds an event looks like this from here. The feed
    // is a record, so an unlabelled row is better than a missing one.
    expect(describeEvent('round_closed', {})).toEqual({ title: 'Round closed' });
    expect(describeEvent('something-new', {})).toEqual({ title: 'Something new' });
  });

  it('survives a payload that is missing, wrong-shaped, or hostile', () => {
    // These are decoder disagreements, not user input, but the feed must render
    // a vague row rather than `NaN USDC` or a blank page.
    expect(describeEvent('contribution', {})).toEqual({ title: 'Contribution' });
    expect(describeEvent('contribution', null)).toEqual({ title: 'Contribution' });
    expect(describeEvent('contribution', 'not an object')).toEqual({ title: 'Contribution' });
    expect(describeEvent('contribution', { member: 42, round: 'three', amount: null })).toEqual({
      title: 'Contribution',
    });
    expect(describeEvent('contribution', { member: '', amount: '' })).toEqual({
      title: 'Contribution',
    });
    expect(describeEvent('join', { position: Number.NaN })).toEqual({ title: 'Member joined' });
    expect(describeEvent('join', { position: Number.POSITIVE_INFINITY })).toEqual({
      title: 'Member joined',
    });
    expect(describeEvent('fee_updated', { feeBps: '50' })).toEqual({
      title: 'Protocol fee changed',
    });
  });

  it('does not mistake a nested payload for a field', () => {
    expect(describeEvent('contribution', { amount: { toString: () => '1' } })).toEqual({
      title: 'Contribution',
    });
  });

  it('always produces a non-empty title', () => {
    for (const name of ['', '-', '___', 'contribution', 'unknown_event']) {
      const described = describeEvent(name, {});
      expect(described.title.length).toBeGreaterThan(0);
    }
  });
});
