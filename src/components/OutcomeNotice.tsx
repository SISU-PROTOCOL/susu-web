import type { InvocationFailure } from '@/lib/stellar/contract-errors';
import { useExplorerTxUrl } from '@/lib/stellar/hooks';
import { Notice } from './ui';

/**
 * The outcome of a state-changing call.
 *
 * Structural rather than the exact `InvocationOutcome`: a group action reports a
 * decoded value where the raw pipeline reports the contract's return value, and
 * `create_group` reports a distinct `created` status carrying the new address.
 * All of them need to be explained to the user in the same vocabulary, so this
 * describes only what the explanation requires.
 */
export type ReportableOutcome =
  | { readonly status: 'confirmed'; readonly hash: string; readonly ledger: number }
  | {
      readonly status: 'created';
      readonly hash: string;
      readonly ledger: number;
      readonly groupAddress: string;
    }
  | {
      readonly status: 'failed';
      readonly hash: string;
      readonly ledger: number;
      readonly reason: string;
    }
  | { readonly status: 'unknown'; readonly hash: string; readonly reason: string }
  | { readonly status: 'retry'; readonly hash: string; readonly reason: string }
  | { readonly status: 'rejected'; readonly hash: string; readonly reason: string }
  | { readonly status: 'invalid'; readonly failure: InvocationFailure };

/**
 * Renders the outcome of a state-changing call.
 *
 * The wording is the whole point of this component. A user who has just signed
 * a transaction needs to know whether their money moved, and the four possible
 * answers are not interchangeable:
 *
 *   - confirmed  — the ledger applied it. This is the only success.
 *   - failed     — the ledger applied it and rejected it. Nothing moved, and
 *                  the fee was still spent.
 *   - unknown    — the network never reported it. It may yet succeed. Telling
 *                  the user it failed would be as wrong as telling them it
 *                  worked, so it is presented as genuinely unresolved.
 *   - retry/rejected — the node would not take it. Nothing was applied.
 *
 * A user rejection never reaches here: the wallet throws, and the caller is
 * expected to treat that as a decision rather than a fault.
 */

function ExplorerLink({ hash }: { hash: string }) {
  const url = useExplorerTxUrl(hash);
  if (url === undefined) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      className="font-medium underline underline-offset-2"
    >
      View on the block explorer
    </a>
  );
}

/**
 * The protocol's own record of the transaction, as decoded events.
 *
 * Offered next to the explorer link because the two answer different questions.
 * The explorer shows the ledger — the authoritative artifact, in XDR. This shows
 * what the Susu contracts emitted, in the vocabulary the protocol uses, and is
 * how a member confirms that a contribution was recorded as theirs rather than
 * merely that some transaction succeeded.
 *
 * It is a link to a page that reads the index, so it can be a few minutes behind
 * for a transaction that was just sent; the page says so rather than appearing
 * empty.
 */
function ReceiptLink({ hash }: { hash: string }) {
  return (
    <a href={`/app/transactions/${hash}`} className="font-medium underline underline-offset-2">
      See what the contract recorded
    </a>
  );
}

export function FailureNotice({ failure }: { failure: InvocationFailure }) {
  return (
    <Notice tone={failure.kind === 'contract-error' ? 'warning' : 'danger'} title={failure.message}>
      {failure.kind === 'contract-error' ? (
        <p className="font-mono text-xs opacity-70">
          {failure.contract} error #{failure.code} · {failure.name}
        </p>
      ) : null}
    </Notice>
  );
}

export function OutcomeNotice({ outcome }: { outcome: ReportableOutcome }) {
  switch (outcome.status) {
    case 'confirmed':
      return (
        <Notice tone="success" title="Confirmed on-chain">
          <p>
            Applied in ledger {outcome.ledger}. <ExplorerLink hash={outcome.hash} /> ·{' '}
            <ReceiptLink hash={outcome.hash} />
          </p>
        </Notice>
      );

    case 'created':
      return (
        <Notice tone="success" title="Group created on-chain">
          <p>
            Deployed in ledger {outcome.ledger}.{' '}
            <a
              href={`/app/groups/${outcome.groupAddress}`}
              className="font-medium underline underline-offset-2"
            >
              Open the new group
            </a>{' '}
            · <ReceiptLink hash={outcome.hash} />
          </p>
        </Notice>
      );

    case 'failed':
      return (
        <Notice tone="danger" title="The network rejected this transaction">
          <p>
            {outcome.reason}. Nothing was changed, but the transaction fee was still spent.{' '}
            <ExplorerLink hash={outcome.hash} />
          </p>
        </Notice>
      );

    case 'unknown':
      return (
        <Notice tone="warning" title="We could not confirm what happened">
          <p>
            {outcome.reason}. This does not mean it failed — it may still be included in a later
            ledger. Check the block explorer before trying again.{' '}
            <ExplorerLink hash={outcome.hash} /> · <ReceiptLink hash={outcome.hash} />
          </p>
        </Notice>
      );

    case 'retry':
      return (
        <Notice tone="warning" title="The network was busy">
          <p>{outcome.reason}. Nothing was changed, and it is safe to try again.</p>
        </Notice>
      );

    case 'rejected':
      return (
        <Notice tone="danger" title="The network refused this transaction">
          <p>{outcome.reason}. Nothing was changed.</p>
        </Notice>
      );

    case 'invalid':
      return <FailureNotice failure={outcome.failure} />;
  }
}
