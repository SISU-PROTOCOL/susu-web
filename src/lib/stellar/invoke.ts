import {
  Account,
  BASE_FEE,
  Contract,
  Transaction,
  TransactionBuilder,
  rpc,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk';
import { describeFailure, type ContractKind, type InvocationFailure } from './contract-errors';
import { assertNetworkAllowsWrites, passphraseFor, type StellarNetwork } from './network';
import { submitAndConfirm, type SubmissionResult } from './submit';
import type { PollOptions } from './result';
import type { WalletAdapter } from '../wallet';

/**
 * Contract invocation.
 *
 * Every call into a contract goes through one of the two functions here, which
 * is what makes the guarantees in the rest of the app hold:
 *
 *   - Reads are simulated, never submitted, and never signed. A read cannot
 *     change anything and never asks the user for anything.
 *   - Writes are built, simulated, assembled, signed by the wallet, submitted,
 *     and then waited on. The simulation step is not an optimization — it is
 *     where the contract itself validates the call, so a call that would be
 *     rejected is refused before the user is asked to approve anything.
 *   - What the wallet hands back is checked against what it was given, because
 *     a signature proves that a transaction was authorized by the key — not
 *     that it is the transaction this app built and simulated.
 *
 * A simulation that fails comes back as a decoded contract error, not a thrown
 * exception, because "you already contributed to this round" is a normal answer.
 */

/** Largest fee we will pay, in stroops, for an invocation. */
const INVOKE_FEE = BASE_FEE;

/** How long a signed invocation remains valid. */
const TIMEOUT_SECONDS = 60;

/**
 * A throwaway account used as the source for read-only simulations.
 *
 * Reads must not require a signature or a funded account, so they are simulated
 * from a fixed, valid address that owns nothing. It is derived from a constant
 * and is not a real account: it has no secret known to anyone and holds no
 * funds. It only has to parse, because the simulation never reaches the ledger.
 */
export const READ_ONLY_SOURCE = 'GAGXKUDVJYEABJOSG7XPLATAGV3GXGZ6LIKYNCUUBKZITFMHRDR3BMEA';

/** The slice of the RPC server this module needs. */
export interface ContractServer {
  getAccount(address: string): Promise<Account>;
  simulateTransaction(transaction: Transaction): Promise<rpc.Api.SimulateTransactionResponse>;
  sendTransaction(transaction: Transaction): Promise<rpc.Api.SendTransactionResponse>;
  getTransaction(hash: string): Promise<rpc.Api.GetTransactionResponse>;
}

/** A read produced a value. */
export interface ReadSuccess<T> {
  readonly ok: true;
  readonly value: T;
}

/** A read could not produce a value, with the reason already human-readable. */
export interface ReadFailure {
  readonly ok: false;
  readonly failure: InvocationFailure;
}

export type ReadResult<T> = ReadSuccess<T> | ReadFailure;

function buildInvocation(
  source: Account,
  contract: Contract,
  method: string,
  args: readonly xdr.ScVal[],
  network: StellarNetwork,
): Transaction {
  return new TransactionBuilder(source, {
    fee: INVOKE_FEE,
    networkPassphrase: passphraseFor(network),
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(TIMEOUT_SECONDS)
    .build();
}

/**
 * Simulates a call and returns the contract's decoded return value.
 *
 * Nothing is signed and nothing is submitted. A failing simulation is returned
 * as a failure carrying the decoded contract error, so a caller can distinguish
 * "the rules say no" from "the network is unreachable" and say so accurately.
 */
export async function readContract<T>(
  server: ContractServer,
  network: StellarNetwork,
  contract: Contract,
  method: string,
  args: readonly xdr.ScVal[],
  decode: (native: unknown) => T,
): Promise<ReadResult<T>> {
  let transaction: Transaction;
  try {
    transaction = buildInvocation(
      new Account(READ_ONLY_SOURCE, '0'),
      contract,
      method,
      args,
      network,
    );
  } catch (cause) {
    return {
      ok: false,
      failure: {
        kind: 'opaque',
        message: 'This call could not be constructed. The contract address may be malformed.',
        raw: cause instanceof Error ? cause.message : String(cause),
      },
    };
  }

  try {
    const simulation = await server.simulateTransaction(transaction);

    if (rpc.Api.isSimulationError(simulation)) {
      return { ok: false, failure: failureFromSimulation(simulation, method) };
    }

    if (rpc.Api.isSimulationRestore(simulation)) {
      return { ok: false, failure: restoreRequiredFailure() };
    }

    if (!rpc.Api.isSimulationSuccess(simulation)) {
      return { ok: false, failure: unexplainedSimulationFailure() };
    }

    // `result` is absent when the simulation invoked nothing, which would mean
    // there is no return value to show. Treat it as unexplained rather than
    // decoding `undefined` into a plausible-looking empty group.
    const result = simulation.result;
    if (result === undefined) {
      return { ok: false, failure: unexplainedSimulationFailure() };
    }

    const value = decode(scValToNative(result.retval));
    return { ok: true, value };
  } catch (cause) {
    return {
      ok: false,
      failure: {
        kind: 'opaque',
        message:
          'This group could not be read from the network. It may be temporarily unreachable.',
        raw: cause instanceof Error ? cause.message : String(cause),
      },
    };
  }
}

function failureFromSimulation(
  simulation: rpc.Api.SimulateTransactionErrorResponse,
  method: string,
): InvocationFailure {
  return describeFailure(String(simulation.error), kindOf(method));
}

/**
 * The contracts extend their own TTL on every mutation, so archived data should
 * not occur while a group is in use. If it ever does, say so plainly rather than
 * presenting it as an empty or broken group.
 */
function restoreRequiredFailure(): InvocationFailure {
  return {
    kind: 'opaque',
    message:
      'This group has been inactive long enough that its on-chain data expired, and it must be restored before it can be used.',
    raw: 'simulation requires restore',
  };
}

/** A simulation that is neither an error, a restore, nor a success. */
function unexplainedSimulationFailure(): InvocationFailure {
  return {
    kind: 'opaque',
    message: 'The network returned a response this app does not recognize. Nothing was changed.',
    raw: 'unrecognized simulation response',
  };
}

/**
 * Maps a method name to the contract that owns it.
 *
 * Needed because error codes are per-contract: code 5 means `NotOpen` on a
 * group and `Paused` on the Factory.
 */
function kindOf(method: string): ContractKind {
  switch (method) {
    case 'create_group':
    case 'get_config':
    case 'get_group':
    case 'get_group_count':
    case 'set_fee':
    case 'set_treasury':
    case 'pause':
    case 'unpause':
      return 'factory';
    default:
      return 'group';
  }
}

/** Why an invocation could not be submitted at all. */
export interface InvocationRejected {
  readonly status: 'invalid';
  readonly failure: InvocationFailure;
}

export type InvocationOutcome = SubmissionResult | InvocationRejected;

/**
 * Every way an invocation can end without having confirmed.
 *
 * Named because it is the common case in the UI: all of these are rendered as
 * "this did not happen, and here is why", with the specific reason deciding the
 * wording.
 */
export type InvocationNotConfirmed = Exclude<InvocationOutcome, { readonly status: 'confirmed' }>;

export interface InvokeOptions {
  readonly server: ContractServer;
  readonly network: StellarNetwork;
  readonly wallet: WalletAdapter;
  /** The account that signs, and the transaction's source. */
  readonly sourceAddress: string;
  readonly contract: Contract;
  readonly method: string;
  readonly args: readonly xdr.ScVal[];
  /**
   * Polling budget for confirmation.
   *
   * Injectable so a caller can bound how long it waits, and so tests do not
   * wait in real time.
   */
  readonly poll?: PollOptions;
}

/**
 * Performs a state-changing contract call.
 *
 * The order is deliberate. The call is simulated before the wallet is involved,
 * so the contract gets to reject it first: if the round is already paid out or
 * the member has already contributed, the user is told that instead of being
 * asked to approve a transaction that would fail. Only a call the contract
 * accepts reaches the signer.
 *
 * Returns `invalid` for a call the contract refused, and otherwise whatever the
 * chain did with it — including `failed` for a transaction that was applied and
 * rejected, and `unknown` for one the network never confirmed. Neither of those
 * is a success.
 */
export async function invokeContract(options: InvokeOptions): Promise<InvocationOutcome> {
  const { server, network, wallet, sourceAddress, contract, method, args } = options;

  // Checked before anything else happens. `submitAndConfirm` also refuses a
  // mainnet write, but by then the user would already have been asked to sign a
  // transaction we had no intention of sending. Refusing first means the wallet
  // is never involved at all.
  assertNetworkAllowsWrites(network);

  const account = await server.getAccount(sourceAddress);
  const transaction = buildInvocation(account, contract, method, args, network);

  const simulation = await server.simulateTransaction(transaction);

  if (rpc.Api.isSimulationError(simulation)) {
    return { status: 'invalid', failure: failureFromSimulation(simulation, method) };
  }

  if (rpc.Api.isSimulationRestore(simulation)) {
    return { status: 'invalid', failure: restoreRequiredFailure() };
  }

  // Wallets sign XDR, so the assembled transaction is handed over and taken back
  // as text. The wallet never receives the account's key and never submits.
  const assembled = rpc.assembleTransaction(transaction, simulation).build();

  const signed = await wallet.signTransaction(assembled.toXDR(), {
    networkPassphrase: passphraseFor(network),
    address: sourceAddress,
  });

  const signedTransaction = TransactionBuilder.fromXDR(signed.signedTxXdr, passphraseFor(network));

  if (!(signedTransaction instanceof Transaction)) {
    throw new Error('A fee-bump transaction was returned where a plain transaction was expected.');
  }

  assertSignedMatchesBuilt(assembled, signedTransaction);

  return submitAndConfirm(server, signedTransaction, {
    network,
    ...(options.poll === undefined ? {} : { poll: options.poll }),
  });
}

/** Compares two byte arrays without pulling in a dependency or needing a secret. */
function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return false;
  }
  return true;
}

/**
 * Names what a substituted transaction changed, for the error message.
 *
 * This exists to make the failure legible, not to be the check — the byte
 * comparison has already established that the two differ. Only the fields a
 * person can act on are named; if none of them accounts for the difference, the
 * change is inside an operation, which is where a substitution would hide.
 */
function describeDifference(assembled: Transaction, signed: Transaction): string {
  const differences: string[] = [];

  if (assembled.source !== signed.source) differences.push('the source account');
  if (assembled.fee !== signed.fee) differences.push('the fee');
  if (assembled.sequence !== signed.sequence) differences.push('the sequence number');

  const expectedBounds = assembled.timeBounds;
  const actualBounds = signed.timeBounds;
  if (
    expectedBounds?.minTime !== actualBounds?.minTime ||
    expectedBounds?.maxTime !== actualBounds?.maxTime
  ) {
    differences.push('the time bounds');
  }

  if (
    assembled.memo.type !== signed.memo.type ||
    String(assembled.memo.value ?? '') !== String(signed.memo.value ?? '')
  ) {
    differences.push('the memo');
  }

  const expectedCount = assembled.operations.length;
  const actualCount = signed.operations.length;
  if (expectedCount !== actualCount) {
    differences.push(`the number of operations (${expectedCount} became ${actualCount})`);
  }

  if (differences.length === 0) return 'an operation or its arguments';

  return differences.join(', ');
}

/**
 * Refuses a transaction the wallet returns that is not the one it was handed.
 *
 * A wallet is a program in the user's browser that this app does not control,
 * and XDR goes out as text and comes back as text, so nothing here compels it
 * to return what it was asked to sign. The signature proves that whatever came
 * back was authorized by the key; it says nothing about whether that is the
 * transaction this app simulated and the user was shown.
 *
 * `signatureBase()` is exactly the bytes a signer authorizes — the network
 * identifier, the envelope type, and the transaction body. Comparing it against
 * the assembled transaction therefore checks everything a wallet could alter,
 * including every operation and every argument, without this function needing
 * to know what any of them are.
 *
 * This throws rather than returning a contract-style failure. A contract
 * refusing a call is a normal answer the UI renders; a wallet substituting a
 * transaction is not a state the app can carry on from, and it must not be
 * possible to mistake it for one.
 */
function assertSignedMatchesBuilt(assembled: Transaction, signed: Transaction): void {
  if (bytesEqual(assembled.signatureBase(), signed.signatureBase())) return;

  throw new Error(
    `The wallet returned a different transaction than the one it was asked to sign: ${describeDifference(assembled, signed)}. Nothing was submitted.`,
  );
}
