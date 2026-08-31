import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useGroupContributions, useGroupPayouts } from '@/lib/api/hooks';
import { apiErrorMessage } from '@/lib/api/errors';
import { formatBaseUnits } from '@/lib/susu/amounts';
import { AddressChip, Button, Card, Notice, Spinner } from '@/components/ui';

/**
 * What the protocol recorded for a group.
 *
 * WHY THIS IS NOT READ FROM THE CONTRACT
 * The contract holds the running total for a round and how many members have
 * paid. It does not hold who paid: those facts are in the events the contract
 * emitted, and contract state is not a log. So when a round is waiting, the
 * question a member asks — "has everyone else paid?" — has no answer on-chain at
 * any price. The index answers it in one request.
 *
 * It is shown beside the chain-derived figures rather than replacing them, and
 * labelled as the index's record, because the two can disagree: the index trails
 * the chain by up to one run. A member looking at a round the contract says is
 * ready may briefly find the index still short a contribution.
 *
 * Amounts are the ledger's own base units, formatted for reading and never
 * converted through a float. Each row links to the transaction that produced it,
 * so a figure here can always be traced back to the artifact.
 */

function Row({
  address,
  detail,
  amount,
  txHash,
  isSelf,
}: {
  address: string;
  detail: string;
  amount: string;
  txHash: string;
  isSelf: boolean;
}) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
      <span className="flex items-center gap-2">
        <AddressChip value={address} />
        {isSelf ? <span className="text-xs text-neutral-500">you</span> : null}
      </span>
      <span className="flex items-baseline gap-3">
        <span className="text-xs text-neutral-500">{detail}</span>
        <span className="font-mono">{amount}</span>
        <Link
          to={`/app/transactions/${txHash}`}
          className="text-xs font-medium underline underline-offset-2"
        >
          tx
        </Link>
      </span>
    </li>
  );
}

/** A section of the record: a heading, and one list. */
function Section({
  title,
  explanation,
  isEmpty,
  hasMore,
  onShowMore,
  pending,
  children,
}: {
  title: string;
  explanation: string;
  isEmpty: boolean;
  hasMore: boolean;
  onShowMore: () => void;
  pending: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <h3 className="text-sm font-medium">{title}</h3>
      <p className="mt-1 text-xs text-neutral-500">{explanation}</p>
      {isEmpty ? (
        <p className="mt-3 text-sm text-neutral-500">Nothing recorded yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">{children}</ul>
      )}
      {hasMore ? (
        <div className="mt-3">
          <Button variant="ghost" pending={pending} onClick={onShowMore}>
            Show more
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function GroupLedger({
  groupContractId,
  viewer,
}: {
  groupContractId: string;
  viewer: string | undefined;
}) {
  const contributions = useGroupContributions(groupContractId);
  const payouts = useGroupPayouts(groupContractId);

  const contributionRows = contributions.data?.pages.flatMap((page) => page.items) ?? [];
  const payoutRows = payouts.data?.pages.flatMap((page) => page.items) ?? [];

  const failed = contributions.isError || payouts.isError;
  const loading = contributions.isPending || payouts.isPending;

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium">Recorded by the protocol</h2>
        <p className="text-xs text-neutral-500">From the index, which trails the chain</p>
      </div>

      {loading ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-neutral-500">
          <Spinner /> Reading the index…
        </p>
      ) : null}

      {failed ? (
        <div className="mt-3">
          {/* The chain figures above are unaffected by this failure, so the notice
              says what is missing rather than implying the page is broken. */}
          <Notice tone="warning" title="The protocol’s record could not be read">
            {apiErrorMessage(contributions.error ?? payouts.error)} The figures above come from the
            contract and are unaffected.
          </Notice>
        </div>
      ) : null}

      {loading || failed ? null : (
        <div className="mt-4 space-y-6">
          <Section
            title="Contributions"
            explanation="Who paid, and in which round. Only recorded events identify a payer."
            isEmpty={contributionRows.length === 0}
            hasMore={contributions.hasNextPage}
            onShowMore={() => void contributions.fetchNextPage()}
            pending={contributions.isFetchingNextPage}
          >
            {contributionRows.map((row) => (
              <Row
                key={row.eventIdentity}
                address={row.member}
                detail={`round ${row.round}`}
                amount={`${formatBaseUnits(row.amount)} USDC`}
                txHash={row.txHash}
                isSelf={viewer !== undefined && row.member === viewer}
              />
            ))}
          </Section>

          <Section
            title="Payouts"
            explanation="What each round released and to whom, net of the protocol fee."
            isEmpty={payoutRows.length === 0}
            hasMore={payouts.hasNextPage}
            onShowMore={() => void payouts.fetchNextPage()}
            pending={payouts.isFetchingNextPage}
          >
            {payoutRows.map((row) => (
              <Row
                key={row.eventIdentity}
                address={row.recipient}
                detail={`round ${row.round}`}
                amount={`${formatBaseUnits(row.recipientAmount)} USDC`}
                txHash={row.txHash}
                isSelf={viewer !== undefined && row.recipient === viewer}
              />
            ))}
          </Section>
        </div>
      )}
    </Card>
  );
}
