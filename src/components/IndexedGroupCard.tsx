import { Link } from 'react-router';
import type { GroupSummary } from '@/lib/api/groups';
import { formatBaseUnits } from '@/lib/susu/amounts';
import { roundSummary } from '@/lib/susu/group-state';
import { AddressChip, Card } from './ui';

/**
 * One group, as the index reports it.
 *
 * SHARED, AND DELIBERATELY PLAIN
 * The dashboard and the group list show the same object, so they show it the same
 * way — two renderings would drift, and the one that drifted would be the one a
 * person trusted. It is also the reason this component reads nothing from the
 * chain: every field comes from the `GroupSummary` it was handed, so a list of a
 * hundred groups costs one request rather than a hundred.
 *
 * WHAT IT DOES NOT CLAIM
 * The index trails the chain, so this is a report rather than the current state,
 * and the card says so once rather than hedging every line. It links to the group
 * page, which reads the contract and is where anything is acted on. That division
 * is the point: discovery here, authority there.
 *
 * The status wording is the contract's own vocabulary — open, active, completed —
 * rather than a friendlier paraphrase, because a member comparing this screen with
 * a block explorer should not have to translate.
 */

const STATUS_LABELS: Record<GroupSummary['status'], string> = {
  open: 'Open',
  active: 'Active',
  completed: 'Completed',
};

const STATUS_STYLES: Record<GroupSummary['status'], string> = {
  open: 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200',
  active: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
  completed: 'bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
};

/**
 * One group, in a list.
 *
 * The lifecycle sentence is composed by `roundSummary`, which is tested on its
 * own; what is left here is layout. The card is a summary and is knowingly
 * incomplete — it says nothing about who has paid, which is not a thing the index
 * summarises per group. That detail lives on the group page.
 */
export function IndexedGroupCard({ group }: { group: GroupSummary }) {
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-neutral-500">#{group.groupId}</span>
            <AddressChip value={group.contractId} />
            <span className={`rounded px-1.5 py-0.5 text-xs ${STATUS_STYLES[group.status]}`}>
              {STATUS_LABELS[group.status]}
            </span>
          </div>

          <p className="mt-2 text-sm">
            <span className="font-mono">{formatBaseUnits(group.contributionAmount)} USDC</span> per
            round · {group.memberCount} of {group.memberCapacity} members
          </p>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            {roundSummary(group)}
          </p>
        </div>

        <Link
          to={`/app/groups/${group.contractId}`}
          className="text-sm font-medium underline underline-offset-2"
        >
          Open
        </Link>
      </div>
    </Card>
  );
}
