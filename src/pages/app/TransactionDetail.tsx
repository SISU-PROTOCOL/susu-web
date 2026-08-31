import { useParams } from 'react-router';
import { useTransactionReceipt } from '@/lib/api/hooks';
import { ApiError, apiErrorMessage } from '@/lib/api/errors';
import { looksLikeTransactionHash, type TransactionEvent } from '@/lib/api/groups';
import { useExplorerTxUrl } from '@/lib/stellar/hooks';
import { AddressChip, Card, Notice, Page, PageHeader, Spinner } from '@/components/ui';

/**
 * One transaction, as the protocol recorded it.
 *
 * The last step of the transaction flow in the specification, which ends
 * "verify state/event → update UI → explorer link". A member who has just signed
 * something has the hash and no other way to see what the contract actually did
 * with it; the wallet shows a signature, and the explorer shows an envelope full
 * of XDR. This shows the decoded events — the same facts the indexer read from the
 * ledger, in the vocabulary the protocol uses.
 *
 * SUCCESS IS NOT ASSUMED HERE
 * A failed transaction is in a ledger too, and its events are recorded, so this
 * page reports what happened rather than what was hoped for. Where the ledger is
 * silent it says so, and it never presents the page as proof: the receipt comes
 * from the index, which trails the chain, so the explorer link is offered as the
 * authority on the same question.
 *
 * AN ABSENT RECEIPT IS NOT AN ERROR
 * A transaction that was just submitted will not be indexed yet, and one that
 * touched no Susu contract never will be. Both look like a 404, so the page keeps
 * checking for a while and then explains the two possibilities instead of
 * claiming either.
 */

const ADDRESS_PATTERN = /^[GC][A-Z2-7]{55}$/;

/** Renders a decoded field value, which arrives as arbitrary JSON. */
function fieldValue(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value) ?? '';
}

function Payload({ payload }: { payload: unknown }) {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    // A decoded event payload is a map of named fields. Anything else is a shape
    // this page does not know how to lay out, and showing the JSON is more useful
    // than showing nothing.
    return (
      <pre className="mt-2 overflow-x-auto rounded bg-neutral-100 p-2 text-xs dark:bg-neutral-800">
        {fieldValue(payload)}
      </pre>
    );
  }

  const entries = Object.entries(payload as Record<string, unknown>);
  if (entries.length === 0) {
    return <p className="mt-2 text-xs text-neutral-500">This event carries no fields.</p>;
  }

  return (
    <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
      {entries.map(([key, value]) => (
        <div key={key} className="flex items-baseline justify-between gap-3">
          <dt className="text-neutral-500">{key}</dt>
          <dd className="truncate font-mono" title={fieldValue(value)}>
            {/* An address is rendered as one, because that is what it is; every
                other value is shown as the decoder produced it. Amounts in a
                payload are base units, deliberately unconverted — a receipt
                should show the ledger's own numbers. */}
            {typeof value === 'string' && ADDRESS_PATTERN.test(value) ? (
              <AddressChip value={value} />
            ) : (
              fieldValue(value)
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function EventCard({ event }: { event: TransactionEvent }) {
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-mono text-sm">{event.name}</h3>
        <AddressChip value={event.contractId} />
      </div>
      <Payload payload={event.payload} />
    </Card>
  );
}

export function TransactionDetail() {
  const { hash } = useParams<{ hash: string }>();
  const valid = hash !== undefined && looksLikeTransactionHash(hash);
  const receipt = useTransactionReceipt(valid ? hash : undefined);
  const explorerUrl = useExplorerTxUrl(valid ? hash : undefined);

  const explorerLink =
    explorerUrl === undefined ? null : (
      <p className="mt-2 text-sm">
        <a
          href={explorerUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="font-medium underline underline-offset-2"
        >
          View on the block explorer
        </a>
      </p>
    );

  // Two failures that look alike and are not. A missing receipt is expected for a
  // few minutes after a submission, so it is a state to wait through; anything
  // else is a problem with reading, and saying "not recorded yet" for it would
  // hide the actual fault behind a reassuring sentence.
  const failureStatus = receipt.error instanceof ApiError ? receipt.error.status : undefined;
  const missing = valid && failureStatus === 404;
  const failed = valid && receipt.isError && failureStatus !== 404;

  return (
    <Page>
      <PageHeader
        title="Transaction"
        description={
          valid ? <code className="font-mono text-xs break-all">{hash}</code> : 'Receipt'
        }
      />

      <div className="mt-8 space-y-6">
        {!valid ? (
          <Notice tone="danger" title="That is not a transaction hash">
            A transaction hash is 64 hexadecimal characters. Check that the whole link was copied.
          </Notice>
        ) : null}

        {valid && receipt.isPending ? (
          <p className="flex items-center gap-2 text-sm text-neutral-500">
            <Spinner /> Reading the protocol&rsquo;s record…
          </p>
        ) : null}

        {/* Still polling: the indexer runs on a schedule, so a transaction that
            was just confirmed is expected to be missing for a few minutes. Saying
            "not found" here would be a wrong answer rather than a slow one. */}
        {missing && !receipt.isAbsent ? (
          <Notice tone="neutral" title="Not recorded yet">
            The protocol index has not reached this transaction. It is re-checked every few seconds,
            and the block explorer can be read meanwhile.
            {explorerLink}
          </Notice>
        ) : null}

        {missing && receipt.isAbsent ? (
          <Notice tone="warning" title="The index has no record of this transaction">
            It either touched no Susu Protocol contract, or the indexer has fallen behind. The block
            explorer shows what the network did with it regardless.
            {explorerLink}
          </Notice>
        ) : null}

        {failed ? (
          <Notice tone="danger" title="This transaction’s record could not be read">
            {apiErrorMessage(receipt.error)}
            {explorerLink}
          </Notice>
        ) : null}

        {receipt.data === undefined ? null : (
          <>
            <Card>
              <h2 className="text-sm font-medium">Included in the ledger</h2>
              <dl className="mt-3 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-xs tracking-wide text-neutral-500 uppercase">Ledger</dt>
                  <dd className="mt-0.5 font-mono">{receipt.data.ledger}</dd>
                </div>
                <div>
                  <dt className="text-xs tracking-wide text-neutral-500 uppercase">
                    Position in ledger
                  </dt>
                  <dd className="mt-0.5 font-mono">{receipt.data.txIndex}</dd>
                </div>
              </dl>
              {explorerLink}
            </Card>

            {receipt.data.events.length === 0 ? (
              <Notice tone="neutral" title="No decoded events">
                This transaction is recorded, but none of its events decoded to a Susu Protocol
                event.
              </Notice>
            ) : (
              <div className="space-y-3">
                <h2 className="text-sm font-medium">
                  What the contracts emitted ({receipt.data.events.length})
                </h2>
                {receipt.data.events.map((event) => (
                  <EventCard key={event.eventIdentity} event={event} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </Page>
  );
}
