import { describe, expect, it } from 'vitest';
import { scValToNative, xdr } from '@stellar/stellar-sdk';
import { createGroupArgs, type CreateGroupInput } from './factory';

const ALICE = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
const USDC = 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA';
const OTHER_TOKEN = 'CDK6IB7PR3HFNOLH4R37ODLVTNYCVT2NX4SIBWKQXLKJNHJJU3PEWGA7';

function input(overrides: Partial<CreateGroupInput> = {}): CreateGroupInput {
  return {
    creator: ALICE,
    token: USDC,
    contributionAmount: 100_000_000n,
    memberCapacity: 3,
    frequencySeconds: 604_800n,
    ...overrides,
  };
}

/** Reads an argument, failing loudly rather than silently seeing `undefined`. */
function arg(args: readonly xdr.ScVal[], index: number): xdr.ScVal {
  const value = args[index];
  if (value === undefined) throw new Error(`Expected an argument at index ${index}.`);
  return value;
}

/**
 * The XDR type name of a value, e.g. `scvU32`.
 *
 * `nativeToScVal` returns a specific ScVal subtype rather than the base union,
 * so its shape is inspected directly instead of through the base typings.
 */
function xdrType(value: unknown): string {
  const type = (value as { type?: unknown }).type;
  if (typeof type !== 'string') {
    throw new Error('Expected an XDR value with a type discriminator.');
  }
  return type;
}

describe('createGroupArgs', () => {
  it('encodes all five arguments in the contract\u2019s declared order', () => {
    const args = createGroupArgs(input());

    expect(args).toHaveLength(5);
    expect(args.map((value) => scValToNative(value))).toEqual([
      ALICE,
      USDC,
      100_000_000n,
      3,
      604_800n,
    ]);
  });

  it('encodes both addresses as addresses, not as strings', () => {
    // A string-encoded address is a different XDR type, and the contract would
    // reject the call only after the user had already signed it.
    const args = createGroupArgs(input());

    expect(xdrType(arg(args, 0))).toBe('scvAddress');
    expect(xdrType(arg(args, 1))).toBe('scvAddress');
  });

  it('encodes the contribution as i128 so large amounts survive', () => {
    expect(xdrType(arg(createGroupArgs(input()), 2))).toBe('scvI128');
  });

  it('encodes the member capacity as u32, not as a wider integer', () => {
    // The contract takes a u32; an i128 or u64 encoding would be rejected.
    expect(xdrType(arg(createGroupArgs(input()), 3))).toBe('scvU32');
  });

  it('encodes the frequency as u64', () => {
    expect(xdrType(arg(createGroupArgs(input()), 4))).toBe('scvU64');
  });

  it('preserves an exact contribution amount across the i128 range', () => {
    const huge = 2n ** 110n;
    const args = createGroupArgs(input({ contributionAmount: huge }));
    expect(scValToNative(arg(args, 2))).toBe(huge);
  });

  it('preserves the boundary member capacities', () => {
    expect(scValToNative(arg(createGroupArgs(input({ memberCapacity: 2 })), 3))).toBe(2);
    expect(scValToNative(arg(createGroupArgs(input({ memberCapacity: 100 })), 3))).toBe(100);
  });

  it('encodes the token the caller supplied, not a hardcoded asset', () => {
    // If the token were hardcoded to USDC here, a group created for another
    // asset would silently be created for USDC instead.
    const args = createGroupArgs(input({ token: OTHER_TOKEN }));
    expect(scValToNative(arg(args, 1))).toBe(OTHER_TOKEN);
  });

  it('encodes the creator the caller supplied', () => {
    const other = 'GDNSSYSCSSJ76FER5WEEXME5G4MTCUBKDRQSKOYP36KUKVDB2VCMERS6';
    const args = createGroupArgs(input({ creator: other }));
    expect(scValToNative(arg(args, 0))).toBe(other);
  });
});
