import { describe, expect, it } from 'vitest';
import {
  ContractShapeError,
  decodeAddressList,
  decodeCount,
  decodeFactoryConfig,
  decodeGroupState,
  decodeRoundInfo,
} from './decode';

const FACTORY = 'CCC7KAX4V4GJD6FVG6GSYQ4I2D2B3CWEOQMIX6YM4QBGXTA6INCGRUYC';
const USDC = 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA';
const ALICE = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
const BOB = 'GDNSSYSCSSJ76FER5WEEXME5G4MTCUBKDRQSKOYP36KUKVDB2VCMERS6';

/**
 * The shape `scValToNative` produces for `get_group()`.
 *
 * Field names are snake_case because they are the contract's own; `i128` and
 * `u64` arrive as `bigint` while `u32` arrives as `number`. The fixture mirrors
 * those choices deliberately, since getting them wrong is one of the bugs these
 * decoders exist to catch.
 */
function groupStateFixture(overrides: Record<string, unknown> = {}): unknown {
  return {
    config: {
      factory: FACTORY,
      creator: ALICE,
      token: USDC,
      treasury: ALICE,
      contribution_amount: 100_000_000n,
      member_capacity: 3,
      frequency_seconds: 604_800n,
      fee_bps: 50,
    },
    status: ['Open'],
    current_round: 0,
    member_count: 0,
    round_phase: ['WaitingForContributions'],
    ...overrides,
  };
}

describe('decodeGroupState', () => {
  it('decodes a freshly created group', () => {
    const snapshot = decodeGroupState(groupStateFixture());

    expect(snapshot.status).toBe('Open');
    expect(snapshot.currentRound).toBe(0);
    expect(snapshot.memberCount).toBe(0);
    expect(snapshot.roundPhase).toBe('WaitingForContributions');
    expect(snapshot.config.contributionAmount).toBe(100_000_000n);
    expect(snapshot.config.memberCapacity).toBe(3);
    expect(snapshot.config.feeBps).toBe(50);
    expect(snapshot.config.token).toBe(USDC);
  });

  it('accepts the single-element array form the network actually sends', () => {
    // Verified against the deployed contract: a `#[contracttype]` unit enum
    // decodes to `["Open"]`, not `"Open"`. An earlier decoder required the bare
    // string and failed on every real group.
    expect(decodeGroupState(groupStateFixture()).status).toBe('Open');
  });

  it('also accepts the bare string form, for flattened values', () => {
    const snapshot = decodeGroupState(groupStateFixture({ status: 'Open' }));
    expect(snapshot.status).toBe('Open');
  });

  it('rejects an array naming more than one variant', () => {
    expect(() => decodeGroupState(groupStateFixture({ status: ['Open', 'Active'] }))).toThrow(
      ContractShapeError,
    );
    expect(() => decodeGroupState(groupStateFixture({ status: [] }))).toThrow(ContractShapeError);
  });

  it('decodes an active group mid-round', () => {
    const snapshot = decodeGroupState(
      groupStateFixture({ status: ['Active'], current_round: 2, member_count: 3 }),
    );

    expect(snapshot.status).toBe('Active');
    expect(snapshot.currentRound).toBe(2);
    expect(snapshot.memberCount).toBe(3);
  });

  it('keeps the contribution amount exact across the i128 range', () => {
    const huge = 2n ** 100n;
    const snapshot = decodeGroupState(
      groupStateFixture({
        config: {
          factory: FACTORY,
          creator: ALICE,
          token: USDC,
          treasury: ALICE,
          contribution_amount: huge,
          member_capacity: 3,
          frequency_seconds: 604_800n,
          fee_bps: 50,
        },
      }),
    );

    expect(snapshot.config.contributionAmount).toBe(huge);
  });

  it('rejects an unrecognized status rather than guessing', () => {
    expect(() => decodeGroupState(groupStateFixture({ status: ['Cancelled'] }))).toThrow(
      ContractShapeError,
    );
  });

  it('rejects a missing field instead of defaulting it to zero', () => {
    const broken = groupStateFixture();
    delete (broken as Record<string, unknown>)['current_round'];
    expect(() => decodeGroupState(broken)).toThrow(/current_round/);
  });

  it('rejects a numeric field that arrived as a string', () => {
    // A string pool would compare unequal to a bigint and make a funded round
    // look unfunded. Failing loudly is the only safe outcome.
    expect(() => decodeGroupState(groupStateFixture({ member_count: '3' }))).toThrow(
      ContractShapeError,
    );
  });

  it('rejects a null or array payload', () => {
    expect(() => decodeGroupState(null)).toThrow(ContractShapeError);
    expect(() => decodeGroupState([])).toThrow(ContractShapeError);
  });
});

describe('decodeRoundInfo', () => {
  it('decodes a round in progress', () => {
    const round = decodeRoundInfo({
      round: 1,
      pool: 200_000_000n,
      contribution_count: 2,
      phase: ['WaitingForContributions'],
      payout_executed: false,
      recipient: BOB,
    });

    expect(round.round).toBe(1);
    expect(round.pool).toBe(200_000_000n);
    expect(round.contributionCount).toBe(2);
    expect(round.payoutExecuted).toBe(false);
    expect(round.recipient).toBe(BOB);
  });

  it('preserves an absent recipient as undefined rather than a placeholder', () => {
    const round = decodeRoundInfo({
      round: 0,
      pool: 0n,
      contribution_count: 0,
      phase: ['WaitingForContributions'],
      payout_executed: false,
      recipient: undefined,
    });

    expect(round.recipient).toBeUndefined();
  });

  it('treats a null recipient as absent, which is what the network sends for None', () => {
    // Verified against the deployed contract: a round that does not exist yet
    // reports `recipient: null`.
    const round = decodeRoundInfo({
      round: 99,
      pool: 0n,
      contribution_count: 0,
      phase: ['WaitingForContributions'],
      payout_executed: false,
      recipient: null,
    });

    expect(round.recipient).toBeUndefined();
  });

  it('decodes an executed payout', () => {
    const round = decodeRoundInfo({
      round: 1,
      pool: 300_000_000n,
      contribution_count: 3,
      phase: ['PayoutExecuted'],
      payout_executed: true,
      recipient: ALICE,
    });

    expect(round.phase).toBe('PayoutExecuted');
    expect(round.payoutExecuted).toBe(true);
  });

  it('rejects an unrecognized phase', () => {
    expect(() =>
      decodeRoundInfo({
        round: 1,
        pool: 0n,
        contribution_count: 0,
        phase: ['Cancelled'],
        payout_executed: false,
        recipient: undefined,
      }),
    ).toThrow(ContractShapeError);
  });
});

describe('decodeFactoryConfig', () => {
  it('decodes the config and hex-encodes the wasm hash', () => {
    const config = decodeFactoryConfig({
      admin: ALICE,
      treasury: BOB,
      fee_bps: 50,
      group_wasm_hash: new Uint8Array([0xab, 0xcd, 0x00, 0xff]),
      paused: false,
    });

    expect(config.admin).toBe(ALICE);
    expect(config.feeBps).toBe(50);
    expect(config.groupWasmHash).toBe('abcd00ff');
    expect(config.paused).toBe(false);
  });

  it('rejects an unrecognized hash representation', () => {
    expect(() =>
      decodeFactoryConfig({
        admin: ALICE,
        treasury: BOB,
        fee_bps: 50,
        group_wasm_hash: 12_345,
        paused: false,
      }),
    ).toThrow(ContractShapeError);
  });
});

describe('decodeCount', () => {
  it('decodes a count', () => {
    expect(decodeCount(7)).toBe(7);
    expect(decodeCount(0)).toBe(0);
  });

  it('accepts a bigint, which the SDK uses for wider integers', () => {
    expect(decodeCount(7n)).toBe(7);
  });

  it('refuses a negative or out-of-range count', () => {
    expect(() => decodeCount(-1)).toThrow(ContractShapeError);
    expect(() => decodeCount(2 ** 32)).toThrow(ContractShapeError);
  });
});

describe('decodeAddressList', () => {
  it('decodes the payout order', () => {
    expect(decodeAddressList([ALICE, BOB])).toEqual([ALICE, BOB]);
  });

  it('decodes an empty order, which is what an empty group has', () => {
    expect(decodeAddressList([])).toEqual([]);
  });

  it('rejects a non-array and a list containing a blank entry', () => {
    expect(() => decodeAddressList('not-a-list')).toThrow(ContractShapeError);
    expect(() => decodeAddressList([ALICE, ''])).toThrow(ContractShapeError);
  });
});
