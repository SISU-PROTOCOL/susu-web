/**
 * Decoding of contract return values into typed, client-side shapes.
 *
 * `scValToNative` gives us plain JavaScript with the contract's own field names,
 * but nothing guarantees the shape: a contract redeploy, a version skew, or a
 * mock in a test can all hand us something unexpected. These decoders validate
 * every field they read and throw `ContractShapeError` rather than coercing.
 *
 * This matters more here than in a typical app. A silently-undefined
 * `current_round` would render as round `0`; a `pool` that arrives as a string
 * would compare unequal to a bigint and make a fully funded round look unfunded.
 * Both would be presented to a member as fact. Refusing to decode is the safe
 * behaviour — the UI shows an error instead of a wrong number.
 */

/** A contract return value did not have the shape this client expects. */
export class ContractShapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContractShapeError';
  }
}

/** Group lifecycle status, mirroring the contract's `Status` enum. */
export type GroupStatus = 'Draft' | 'Open' | 'Active' | 'Completed';

/** Round sub-state, mirroring the contract's `RoundPhase` enum. */
export type RoundPhase = 'WaitingForContributions' | 'ReadyForPayout' | 'PayoutExecuted';

const GROUP_STATUSES: readonly GroupStatus[] = ['Draft', 'Open', 'Active', 'Completed'];
const ROUND_PHASES: readonly RoundPhase[] = [
  'WaitingForContributions',
  'ReadyForPayout',
  'PayoutExecuted',
];

/** Immutable group configuration, as read from chain. */
export interface GroupConfigView {
  readonly factory: string;
  readonly creator: string;
  readonly token: string;
  readonly treasury: string;
  /** Exact per-member contribution, in token stroops. */
  readonly contributionAmount: bigint;
  /** Member count, which is also the number of rounds. */
  readonly memberCapacity: number;
  readonly frequencySeconds: bigint;
  readonly feeBps: number;
}

/** Full observable group state. */
export interface GroupSnapshot {
  readonly config: GroupConfigView;
  readonly status: GroupStatus;
  /** 1-based. `0` before the group starts. */
  readonly currentRound: number;
  readonly memberCount: number;
  readonly roundPhase: RoundPhase;
}

/** Observable state of one round. */
export interface RoundSnapshot {
  readonly round: number;
  readonly pool: bigint;
  readonly contributionCount: number;
  readonly phase: RoundPhase;
  readonly payoutExecuted: boolean;
  /** The scheduled recipient, or `undefined` for a round that does not exist yet. */
  readonly recipient: string | undefined;
}

/** Factory configuration. */
export interface FactoryConfigView {
  readonly admin: string;
  readonly treasury: string;
  readonly feeBps: number;
  /** Hex encoding of the 32-byte Group wasm hash. */
  readonly groupWasmHash: string;
  readonly paused: boolean;
}

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ContractShapeError(`Expected ${path} to be an object.`);
  }
  return value as Record<string, unknown>;
}

function field(record: Record<string, unknown>, key: string, path: string): unknown {
  if (!(key in record)) {
    throw new ContractShapeError(`Expected ${path}.${key} to be present.`);
  }
  return record[key];
}

function asString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value === '') {
    throw new ContractShapeError(`Expected ${path} to be a non-empty string.`);
  }
  return value;
}

function asBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    throw new ContractShapeError(`Expected ${path} to be a boolean.`);
  }
  return value;
}

/**
 * Reads an integer.
 *
 * Accepts `bigint` and `number` because the SDK maps `u32` to `number` but
 * `u64` and `i128` to `bigint`. Accepting a `number` for a 128-bit field would
 * be a precision hazard, so `signed` fields require an exact integer and are
 * converted through `BigInt`, which is lossless for values already held in a
 * double.
 */
function asBigInt(value: unknown, path: string): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return BigInt(value);
  throw new ContractShapeError(`Expected ${path} to be an integer.`);
}

function asU32(value: unknown, path: string): number {
  const integer = asBigInt(value, path);
  if (integer < 0n || integer > 4_294_967_295n) {
    throw new ContractShapeError(`Expected ${path} to fit in a u32.`);
  }
  return Number(integer);
}

/**
 * Reads a unit enum variant.
 *
 * A `#[contracttype]` unit enum is encoded as a single-element vector holding the
 * variant name, which `scValToNative` surfaces as `["Active"]` rather than
 * `"Active"`. This was verified against the deployed contract rather than
 * assumed — an earlier version of this decoder required a bare string and
 * therefore failed on every real group, while passing against its own fixtures.
 *
 * Both forms are accepted: the array is what the network actually sends, and the
 * bare string is what a flattened or hand-built value looks like.
 */
function asEnum<T extends string>(value: unknown, allowed: readonly T[], path: string): T {
  let candidate = value;

  if (Array.isArray(value)) {
    if (value.length !== 1) {
      throw new ContractShapeError(`Expected ${path} to name exactly one enum variant.`);
    }
    candidate = value[0];
  }

  const name = asString(candidate, path);
  if (!(allowed as readonly string[]).includes(name)) {
    throw new ContractShapeError(
      `Expected ${path} to be one of ${allowed.join(', ')}, received "${name}".`,
    );
  }
  return name as T;
}

function asHexBytes(value: unknown, path: string): string {
  if (value instanceof Uint8Array) {
    return Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  if (typeof value === 'string' && /^[0-9a-fA-F]*$/.test(value) && value.length % 2 === 0) {
    return value.toLowerCase();
  }
  throw new ContractShapeError(`Expected ${path} to be a byte array.`);
}

/** Decodes a `Status`. Throws on an unrecognized variant. */
export function decodeGroupStatus(value: unknown): GroupStatus {
  return asEnum(value, GROUP_STATUSES, 'status');
}

/** Decodes a `RoundPhase`. Throws on an unrecognized variant. */
export function decodeRoundPhase(value: unknown, path = 'round_phase'): RoundPhase {
  return asEnum(value, ROUND_PHASES, path);
}

function decodeGroupConfig(value: unknown, path: string): GroupConfigView {
  const record = asRecord(value, path);
  return {
    factory: asString(field(record, 'factory', path), `${path}.factory`),
    creator: asString(field(record, 'creator', path), `${path}.creator`),
    token: asString(field(record, 'token', path), `${path}.token`),
    treasury: asString(field(record, 'treasury', path), `${path}.treasury`),
    contributionAmount: asBigInt(
      field(record, 'contribution_amount', path),
      `${path}.contribution_amount`,
    ),
    memberCapacity: asU32(field(record, 'member_capacity', path), `${path}.member_capacity`),
    frequencySeconds: asBigInt(
      field(record, 'frequency_seconds', path),
      `${path}.frequency_seconds`,
    ),
    feeBps: asU32(field(record, 'fee_bps', path), `${path}.fee_bps`),
  };
}

/** Decodes the value returned by `get_group()`. */
export function decodeGroupState(value: unknown): GroupSnapshot {
  const record = asRecord(value, 'group');
  return {
    config: decodeGroupConfig(field(record, 'config', 'group'), 'group.config'),
    status: decodeGroupStatus(field(record, 'status', 'group')),
    currentRound: asU32(field(record, 'current_round', 'group'), 'group.current_round'),
    memberCount: asU32(field(record, 'member_count', 'group'), 'group.member_count'),
    roundPhase: decodeRoundPhase(field(record, 'round_phase', 'group'), 'group.round_phase'),
  };
}

/**
 * Decodes the value returned by `get_round()`.
 *
 * `recipient` is an `Option<Address>`, which arrives as `undefined` for a round
 * that does not exist yet. That is a meaningful absence, not a decoding failure,
 * so it is preserved rather than defaulted to a placeholder address.
 */
export function decodeRoundInfo(value: unknown): RoundSnapshot {
  const record = asRecord(value, 'round');
  const recipient = field(record, 'recipient', 'round');

  return {
    round: asU32(field(record, 'round', 'round'), 'round.round'),
    pool: asBigInt(field(record, 'pool', 'round'), 'round.pool'),
    contributionCount: asU32(
      field(record, 'contribution_count', 'round'),
      'round.contribution_count',
    ),
    phase: decodeRoundPhase(field(record, 'phase', 'round'), 'round.phase'),
    payoutExecuted: asBoolean(field(record, 'payout_executed', 'round'), 'round.payout_executed'),
    recipient:
      recipient === undefined || recipient === null ? undefined : asString(recipient, 'recipient'),
  };
}

/** Decodes the value returned by the Factory's `get_config()`. */
export function decodeFactoryConfig(value: unknown): FactoryConfigView {
  const record = asRecord(value, 'config');
  return {
    admin: asString(field(record, 'admin', 'config'), 'config.admin'),
    treasury: asString(field(record, 'treasury', 'config'), 'config.treasury'),
    feeBps: asU32(field(record, 'fee_bps', 'config'), 'config.fee_bps'),
    groupWasmHash: asHexBytes(field(record, 'group_wasm_hash', 'config'), 'config.group_wasm_hash'),
    paused: asBoolean(field(record, 'paused', 'config'), 'config.paused'),
  };
}

/**
 * Decodes a scalar count, such as `get_group_count()`, `get_member_count()` or
 * `get_member()`.
 *
 * `get_member()` returns `0` for a non-member, which is a legitimate answer and
 * is preserved as `0` rather than being treated as absent.
 */
export function decodeCount(value: unknown, path = 'count'): number {
  return asU32(value, path);
}

/**
 * Decodes an `i128`, such as a token balance or a round pool.
 *
 * Kept separate from `decodeCount` because a balance is not a count: an i128
 * amount exceeds the u32 range for any realistic token, so decoding one with the
 * count decoder would throw on real data.
 */
export function decodeAmount(value: unknown, path = 'amount'): bigint {
  return asBigInt(value, path);
}

/** Decodes a `Vec<Address>` such as `get_payout_order()`. */
export function decodeAddressList(value: unknown, path = 'addresses'): string[] {
  if (!Array.isArray(value)) {
    throw new ContractShapeError(`Expected ${path} to be an array.`);
  }
  return value.map((entry, index) => asString(entry, `${path}[${index}]`));
}

/**
 * Decodes a single `Address`, such as the one `create_group` returns.
 *
 * Validated for the `C...` contract form, because this value is used to address
 * a contract. A malformed address would otherwise be persisted as the user's
 * group and fail only later, somewhere less comprehensible.
 */
export function decodeContractAddress(value: unknown, path = 'address'): string {
  const address = asString(value, path);
  if (!/^C[A-Z2-7]{55}$/.test(address)) {
    throw new ContractShapeError(`Expected ${path} to be a contract address.`);
  }
  return address;
}
