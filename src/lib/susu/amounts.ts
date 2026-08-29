/**
 * USDC amounts.
 *
 * Money is only ever an integer number of stroops (the smallest unit, 10^-7
 * USDC). This module is the single boundary where a human-readable decimal
 * becomes that integer, and it deliberately uses no floating point at any point
 * in the conversion: `Number` cannot represent most decimal amounts exactly, and
 * `0.1 + 0.2 !== 0.3` is not an acceptable property for a savings protocol.
 *
 * The contract independently rejects any amount that is not exactly the
 * configured contribution, so this module exists to produce a correct value and
 * a useful message, not to be the security boundary.
 */

/** USDC has seven decimal places. */
export const USDC_DECIMALS = 7;

/** One USDC in stroops. */
export const USDC_SCALE = 10n ** BigInt(USDC_DECIMALS);

/** The largest value a Soroban `i128` can hold. */
export const I128_MAX = 2n ** 127n - 1n;

/** Matches a non-negative decimal with at most `USDC_DECIMALS` fraction digits. */
const DECIMAL_PATTERN = /^(\d+)(?:\.(\d+))?$/;

/**
 * Why an amount string could not be interpreted.
 *
 * These are validation outcomes, not faults: the caller is expected to render
 * them next to the offending field.
 */
export type AmountError = 'empty' | 'malformed' | 'too-many-decimals' | 'negative' | 'too-large';

const MESSAGES: Record<AmountError, string> = {
  empty: 'Enter an amount.',
  malformed: 'Enter a valid number, such as 10 or 10.5.',
  'too-many-decimals': `USDC supports at most ${USDC_DECIMALS} decimal places.`,
  negative: 'Enter a positive amount.',
  'too-large': 'This amount is too large to be represented on-chain.',
};

/** A human-readable explanation of an amount error. */
export function amountErrorMessage(error: AmountError): string {
  return MESSAGES[error];
}

export type ParsedAmount =
  | { readonly ok: true; readonly stroops: bigint }
  | { readonly ok: false; readonly error: AmountError };

/**
 * Interprets a decimal USDC string as an exact number of stroops.
 *
 * Accepts `"10"`, `"10.5"`, `"0.0000001"`. Rejects a leading sign (including
 * `"+"` and values like `"1e3"`, which is not a decimal), a missing integer
 * part, and anything beyond seven decimal places. Truncation is never performed:
 * an amount that cannot be represented exactly is refused rather than silently
 * altered.
 */
export function parseUsdc(input: string): ParsedAmount {
  const value = input.trim();
  if (value === '') return { ok: false, error: 'empty' };

  if (value.startsWith('-')) return { ok: false, error: 'negative' };

  const match = DECIMAL_PATTERN.exec(value);
  if (match === null) {
    // Distinguish "too precise" from "not a number": "1.23456789" is a number the
    // user meant, and telling them it is malformed would be unhelpful.
    const precision = /^\d+\.(\d+)$/.exec(value);
    if (precision?.[1] !== undefined && precision[1].length > USDC_DECIMALS) {
      return { ok: false, error: 'too-many-decimals' };
    }
    return { ok: false, error: 'malformed' };
  }

  const [, whole, fraction = ''] = match;
  if (whole === undefined) return { ok: false, error: 'malformed' };
  if (fraction.length > USDC_DECIMALS) return { ok: false, error: 'too-many-decimals' };

  const padded = fraction.padEnd(USDC_DECIMALS, '0');
  const stroops = BigInt(whole) * USDC_SCALE + BigInt(padded);

  if (stroops > I128_MAX) return { ok: false, error: 'too-large' };

  return { ok: true, stroops };
}

/**
 * Renders stroops as a decimal USDC string.
 *
 * Trailing zeros in the fraction are removed so that `100_000_000n` renders as
 * `"10"` rather than `"10.0000000"`. Never produces exponential notation, which
 * would be unusable in a form field or a transaction memo.
 */
export function formatUsdc(stroops: bigint): string {
  if (stroops < 0n) throw new RangeError('Cannot format a negative amount.');

  const whole = stroops / USDC_SCALE;
  const fraction = stroops % USDC_SCALE;

  if (fraction === 0n) return whole.toString();

  const padded = fraction.toString().padStart(USDC_DECIMALS, '0');
  const trimmed = padded.replace(/0+$/, '');
  return `${whole.toString()}.${trimmed}`;
}

/** Base units as the API reports them: an integer, never a decimal or a sign. */
const BASE_UNITS_PATTERN = /^\d+$/;

/**
 * Reads a base-unit amount that came from the API.
 *
 * The API selects monetary columns with `::text` so that a `numeric` never passes
 * through a JavaScript number, and it validates that what it sends is an integer
 * — so a value that does not match here is a contract mismatch rather than bad
 * input, and throwing is the right response. Returning `0n` would render a real
 * balance as nothing.
 */
export function parseBaseUnits(value: string): bigint {
  if (!BASE_UNITS_PATTERN.test(value)) {
    throw new Error(`Not a base-unit amount: ${JSON.stringify(value)}`);
  }
  return BigInt(value);
}

/**
 * Renders a base-unit string from the API for display.
 *
 * The companion to `parseUsdc`, going the other way: that function turns what a
 * person typed into stroops, this turns what the index reported into what a
 * person reads.
 */
export function formatBaseUnits(value: string): string {
  return formatUsdc(parseBaseUnits(value));
}

/**
 * Splits an amount into the protocol fee and what the recipient receives.
 *
 * Mirrors the contract's arithmetic exactly: the fee is truncated, never
 * rounded up, so truncation always favours the recipient and the two parts
 * always sum back to the pool. Duplicated here only so the UI can preview a
 * payout honestly before anyone signs anything — the contract remains the
 * authority.
 */
export function splitPayout(
  pool: bigint,
  feeBps: number,
): { readonly fee: bigint; readonly recipientAmount: bigint } {
  if (pool < 0n) throw new RangeError('A pool cannot be negative.');
  if (!Number.isInteger(feeBps) || feeBps < 0) {
    throw new RangeError('A fee in basis points must be a non-negative integer.');
  }

  const fee = (pool * BigInt(feeBps)) / 10_000n;
  return { fee, recipientAmount: pool - fee };
}
