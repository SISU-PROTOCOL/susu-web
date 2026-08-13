import type { rpc, Transaction } from '@stellar/stellar-sdk';
import { assertNetworkAllowsWrites, type StellarNetwork } from './network';
import {
  decideFromSendResponse,
  pollTransactionOutcome,
  type PollOptions,
  type SendStatus,
  type TransactionReader,
  type TxOutcome,
} from './result';

/**
 * Submission orchestration.
 *
 * This is the single path through which a signed transaction reaches the
 * network, and it exists to enforce one rule: a signature is not a result.
 *
 * The sequence is build → simulate → sign in the wallet → submit → wait for the
 * ledger. Only the last step can produce `confirmed`. A `sendTransaction` that
 * returns PENDING proves the node accepted the envelope into its mempool, which
 * is a statement about intent, not about money.
 */

/** The slice of the RPC server this module needs. */
export interface TransactionSubmitter {
  sendTransaction(transaction: Transaction): Promise<rpc.Api.SendTransactionResponse>;
}

/**
 * The result of attempting a transaction.
 *
 * `unknown` means the network never reported the transaction in a ledger within
 * the polling budget. It is deliberately distinct from both `confirmed` and
 * `failed`, and callers must not render it as either.
 */
export type SubmissionResult =
  | { readonly status: 'confirmed'; readonly hash: string; readonly ledger: number }
  | {
      readonly status: 'failed';
      readonly hash: string;
      readonly ledger: number;
      readonly reason: string;
      readonly resultXdr: string;
    }
  | { readonly status: 'unknown'; readonly hash: string; readonly reason: string }
  | { readonly status: 'retry'; readonly hash: string; readonly reason: string }
  | { readonly status: 'rejected'; readonly hash: string; readonly reason: string };

export interface SubmitOptions {
  /** The network the transaction was built for. Writes are refused on mainnet. */
  readonly network: StellarNetwork;
  readonly poll?: PollOptions;
}

function fromTxOutcome(outcome: TxOutcome): SubmissionResult {
  switch (outcome.status) {
    case 'confirmed':
      return { status: 'confirmed', hash: outcome.hash, ledger: outcome.ledger };
    case 'failed':
      return {
        status: 'failed',
        hash: outcome.hash,
        ledger: outcome.ledger,
        reason: outcome.reason,
        resultXdr: outcome.resultXdr,
      };
    case 'not_found':
      return {
        status: 'unknown',
        hash: outcome.hash,
        reason: 'the network did not confirm or reject the transaction in time',
      };
  }
}

/**
 * Submits a signed transaction and reports what the chain did with it.
 *
 * Never throws for a transaction that the network rejects: a rejection is a
 * result, and the caller is expected to render it. It throws only for a
 * programming or configuration error, such as attempting a mainnet write.
 */
export async function submitAndConfirm(
  server: TransactionSubmitter & TransactionReader,
  transaction: Transaction,
  options: SubmitOptions,
): Promise<SubmissionResult> {
  assertNetworkAllowsWrites(options.network);

  const response = await server.sendTransaction(transaction);
  const decision = decideFromSendResponse({
    status: response.status as SendStatus,
    hash: response.hash,
  });

  switch (decision.kind) {
    case 'retry':
      return { status: 'retry', hash: decision.hash, reason: decision.reason };
    case 'rejected':
      return { status: 'rejected', hash: decision.hash, reason: decision.reason };
    case 'await-confirmation': {
      const outcome = await pollTransactionOutcome(server, decision.hash, options.poll ?? {});
      return fromTxOutcome(outcome);
    }
  }
}
