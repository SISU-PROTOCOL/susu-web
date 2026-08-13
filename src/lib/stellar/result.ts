import { rpc } from '@stellar/stellar-sdk';

/**
 * Interpretation of chain results.
 *
 * This module is the reason the frontend can claim it is not a custodian. A
 * wallet signature proves only that a user authorized something, and a
 * successful `sendTransaction` proves only that a node accepted the envelope
 * into its mempool. Neither is confirmation. A transaction has succeeded only
 * when the network reports it as `SUCCESS` *in a ledger*, and the only authority
 * on that is `getTransaction`.
 *
 * Every function here therefore errs towards "not yet known" rather than
 * "succeeded".
 */

/** Statuses a node can return from `sendTransaction`. */
export type SendStatus = 'PENDING' | 'DUPLICATE' | 'TRY_AGAIN_LATER' | 'ERROR';

/** What should be done with a node's response to a submission. */
export type SubmissionDecision =
  | { readonly kind: 'await-confirmation'; readonly hash: string }
  | { readonly kind: 'retry'; readonly hash: string; readonly reason: string }
  | { readonly kind: 'rejected'; readonly hash: string; readonly reason: string };

/**
 * The outcome of a transaction, as far as the chain is concerned.
 *
 * `not_found` is not a failure: a transaction that has not been included in a
 * ledger yet is indistinguishable from one that was never accepted, so it is
 * reported as unknown rather than guessed at.
 */
export type TxOutcome =
  | { readonly status: 'confirmed'; readonly hash: string; readonly ledger: number }
  | {
      readonly status: 'failed';
      readonly hash: string;
      readonly ledger: number;
      readonly reason: string;
      readonly resultXdr: string;
    }
  | { readonly status: 'not_found'; readonly hash: string };

/** The slice of the RPC server this module needs, so tests can supply a fake. */
export interface TransactionReader {
  getTransaction(hash: string): Promise<rpc.Api.GetTransactionResponse>;
}

export interface PollOptions {
  /** Maximum number of `getTransaction` calls before giving up. */
  readonly attempts?: number;
  /** Delay between polls, in milliseconds. */
  readonly delayMs?: number;
  /** Injectable for tests; defaults to a real timer. */
  readonly sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_ATTEMPTS = 30;
const DEFAULT_DELAY_MS = 1000;

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Decides what to do with a node's response to `sendTransaction`.
 *
 * `PENDING` and `DUPLICATE` both mean "the network may have this transaction",
 * so both must be awaited rather than reported as success. `DUPLICATE` in
 * particular is not an error: it usually means a previous submission already
 * landed and is being retried by some other path.
 */
export function decideFromSendResponse(response: {
  status: SendStatus;
  hash: string;
  errorResult?: unknown;
}): SubmissionDecision {
  const { status, hash } = response;
  switch (status) {
    case 'PENDING':
    case 'DUPLICATE':
      return { kind: 'await-confirmation', hash };
    case 'TRY_AGAIN_LATER':
      return {
        kind: 'retry',
        hash,
        reason: 'the network is busy; the transaction was not accepted into a ledger',
      };
    case 'ERROR':
      return {
        kind: 'rejected',
        hash,
        reason: 'the network rejected the transaction before it could be applied',
      };
  }
}

/** Reads the top-level result code out of a failed transaction, defensively. */
function resultCodeOf(resultXdr: unknown): string | undefined {
  try {
    const code = (resultXdr as { result?: () => { switch?: () => { name?: string } } })
      .result?.()
      .switch?.();
    return code?.name;
  } catch {
    return undefined;
  }
}

function toBase64(resultXdr: unknown): string {
  try {
    const encode = (resultXdr as { toXDR?: (format?: string) => string }).toXDR;
    return typeof encode === 'function' ? encode.call(resultXdr, 'base64') : '';
  } catch {
    return '';
  }
}

/**
 * Converts a `getTransaction` response into a terminal outcome, or `not_found`
 * when the network has not seen the transaction in a ledger yet.
 */
export function outcomeFromTransaction(response: rpc.Api.GetTransactionResponse): TxOutcome {
  const hash = response.txHash;

  switch (response.status) {
    case rpc.Api.GetTransactionStatus.SUCCESS:
      return { status: 'confirmed', hash, ledger: response.ledger };
    case rpc.Api.GetTransactionStatus.FAILED: {
      const code = resultCodeOf(response.resultXdr);
      return {
        status: 'failed',
        hash,
        ledger: response.ledger,
        reason: code === undefined ? 'the transaction failed' : `the transaction failed (${code})`,
        resultXdr: toBase64(response.resultXdr),
      };
    }
    case rpc.Api.GetTransactionStatus.NOT_FOUND:
      return { status: 'not_found', hash };
  }
}

/**
 * Polls `getTransaction` until the transaction reaches a terminal state.
 *
 * Returns `not_found` if it is still unknown after the attempt budget is spent,
 * which callers must present as "unknown", never as success or failure.
 */
export async function pollTransactionOutcome(
  reader: TransactionReader,
  hash: string,
  options: PollOptions = {},
): Promise<TxOutcome> {
  const attempts = options.attempts ?? DEFAULT_ATTEMPTS;
  const delayMs = options.delayMs ?? DEFAULT_DELAY_MS;
  const sleep = options.sleep ?? defaultSleep;

  if (attempts < 1) {
    throw new Error('pollTransactionOutcome requires at least one attempt.');
  }

  let last: TxOutcome = { status: 'not_found', hash };

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const outcome = outcomeFromTransaction(await reader.getTransaction(hash));
    last = outcome;

    if (outcome.status !== 'not_found') {
      return outcome;
    }

    const isLastAttempt = attempt === attempts - 1;
    if (!isLastAttempt) {
      await sleep(delayMs);
    }
  }

  return last;
}
