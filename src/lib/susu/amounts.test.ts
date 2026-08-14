import { describe, expect, it } from 'vitest';
import {
  I128_MAX,
  USDC_SCALE,
  formatUsdc,
  parseUsdc,
  splitPayout,
  type ParsedAmount,
} from './amounts';

/** Unwraps a successful parse, failing the test with the error code otherwise. */
function stroops(input: string): bigint {
  const result: ParsedAmount = parseUsdc(input);
  if (!result.ok) throw new Error(`Expected "${input}" to parse, got ${result.error}`);
  return result.stroops;
}

function error(input: string): string {
  const result = parseUsdc(input);
  if (result.ok) throw new Error(`Expected "${input}" to fail, got ${result.stroops}`);
  return result.error;
}

describe('USDC_SCALE', () => {
  it('is seven decimal places', () => {
    expect(USDC_SCALE).toBe(10_000_000n);
  });
});

describe('parseUsdc', () => {
  it('converts whole amounts', () => {
    expect(stroops('10')).toBe(100_000_000n);
    expect(stroops('1')).toBe(10_000_000n);
    expect(stroops('0')).toBe(0n);
  });

  it('converts fractional amounts exactly', () => {
    expect(stroops('10.5')).toBe(105_000_000n);
    expect(stroops('0.0000001')).toBe(1n);
    expect(stroops('1.2345678')).toBe(12_345_678n);
    expect(stroops('0.1')).toBe(1_000_000n);
  });

  it('never loses precision on amounts that are inexact as a float', () => {
    // 0.1 + 0.2 !== 0.3 in binary floating point. The parse must not care.
    expect(stroops('0.1') + stroops('0.2')).toBe(stroops('0.3'));
    // 1/3 of a 7-decimal unit is not representable; the 8th digit must be refused
    // rather than silently rounded.
    expect(error('0.33333333')).toBe('too-many-decimals');
  });

  it('tolerates surrounding whitespace', () => {
    expect(stroops('  10.5  ')).toBe(105_000_000n);
  });

  it('rejects an empty or whitespace-only amount', () => {
    expect(error('')).toBe('empty');
    expect(error('   ')).toBe('empty');
  });

  it('rejects a negative amount rather than returning a negative value', () => {
    expect(error('-1')).toBe('negative');
    expect(error('-0.5')).toBe('negative');
  });

  it('rejects anything that is not a plain decimal', () => {
    expect(error('abc')).toBe('malformed');
    expect(error('1e3')).toBe('malformed');
    expect(error('1.')).toBe('malformed');
    expect(error('.5')).toBe('malformed');
    expect(error('1,000')).toBe('malformed');
    expect(error('$10')).toBe('malformed');
    expect(error('+10')).toBe('malformed');
    expect(error('Infinity')).toBe('malformed');
    expect(error('NaN')).toBe('malformed');
  });

  it('reports excessive precision distinctly from malformed input', () => {
    expect(error('1.23456789')).toBe('too-many-decimals');
    expect(error('0.00000001')).toBe('too-many-decimals');
  });

  it('accepts the boundary of representable precision', () => {
    expect(stroops('1.2345678')).toBe(12_345_678n);
  });

  it('refuses values beyond the on-chain i128 range', () => {
    const beyond = (I128_MAX + 1n).toString();
    expect(error(beyond)).toBe('too-large');
  });

  it('round-trips every amount it produces', () => {
    for (const input of ['0', '1', '10', '10.5', '0.0000001', '1.2345678', '999999.9999999']) {
      expect(formatUsdc(stroops(input))).toBe(input);
    }
  });
});

describe('formatUsdc', () => {
  it('renders whole amounts without a fraction', () => {
    expect(formatUsdc(100_000_000n)).toBe('10');
    expect(formatUsdc(0n)).toBe('0');
  });

  it('renders fractions without trailing zeros', () => {
    expect(formatUsdc(105_000_000n)).toBe('10.5');
    expect(formatUsdc(10_000_000n)).toBe('1');
  });

  it('pads a single stroop to the full precision', () => {
    expect(formatUsdc(1n)).toBe('0.0000001');
    expect(formatUsdc(12_345_678n)).toBe('1.2345678');
  });

  it('never emits exponential notation', () => {
    expect(formatUsdc(10n ** 21n)).not.toMatch(/e/i);
  });

  it('refuses a negative amount', () => {
    expect(() => formatUsdc(-1n)).toThrow(RangeError);
  });
});

describe('splitPayout', () => {
  it('matches the contract arithmetic for a three-member round', () => {
    // 3 members x 10 USDC = 30 USDC pool, 50 bps = 0.5%.
    const pool = 300_000_000n;
    const { fee, recipientAmount } = splitPayout(pool, 50);

    expect(fee).toBe(1_500_000n); // 0.15 USDC
    expect(recipientAmount).toBe(298_500_000n); // 29.85 USDC
  });

  it('always sums back to the pool exactly', () => {
    for (const pool of [0n, 1n, 7n, 999_999_999n, 300_000_000n, 10n ** 20n]) {
      for (const bps of [0, 1, 25, 50]) {
        const { fee, recipientAmount } = splitPayout(pool, bps);
        expect(fee + recipientAmount).toBe(pool);
      }
    }
  });

  it('truncates the fee so rounding always favours the recipient', () => {
    // 50 bps of 1 stroop is 0.005 stroops. The recipient must get the stroop.
    const { fee, recipientAmount } = splitPayout(1n, 50);
    expect(fee).toBe(0n);
    expect(recipientAmount).toBe(1n);
  });

  it('never charges more than the configured maximum', () => {
    const pool = 300_000_000n;
    expect(splitPayout(pool, 50).fee).toBeLessThanOrEqual((pool * 50n) / 10_000n);
  });

  it('rejects a negative pool and a nonsense fee', () => {
    expect(() => splitPayout(-1n, 50)).toThrow(RangeError);
    expect(() => splitPayout(100n, -1)).toThrow(RangeError);
    expect(() => splitPayout(100n, 1.5)).toThrow(RangeError);
  });
});
