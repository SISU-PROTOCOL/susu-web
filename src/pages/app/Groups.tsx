import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { formatUsdc } from '@/lib/susu/amounts';
import {
  useGroupAddress,
  useGroupCount,
  useGroupSnapshot,
  useMemberPosition,
} from '@/lib/susu/hooks';
import { useWallet } from '@/lib/wallet/context';
import {
  AddressChip,
  Button,
  Card,
  Field,
  Notice,
  Page,
  PageHeader,
  Spinner,
} from '@/components/ui';
import { WalletButton } from '@/components/WalletButton';

/**
 * Groups.
 *
 * A group's address is derived from its id, so groups are discoverable by
 * walking ids. That is fine for a handful and wrong for thousands: this screen
 * scans only the most recent few and says so. Complete history needs the
 * indexer, and pretending otherwise would mean showing an incomplete list as if
 * it were all of them.
 */

/** How many of the most recent groups this screen will look up. */
const SCAN_LIMIT = 12;

function GroupRow({ id }: { id: number }) {
  const { address: connected } = useWallet();
  const addressQuery = useGroupAddress(id);
  const snapshot = useGroupSnapshot(addressQuery.data);
  const position = useMemberPosition(addressQuery.data, connected);

  if (addressQuery.isPending || snapshot.isPending) {
    return (
      <Card>
        <p className="flex items-center gap-2 text-sm text-neutral-500">
          <Spinner /> Group #{id}
        </p>
      </Card>
    );
  }

  const group = snapshot.data;
  const groupAddress = addressQuery.data;

  if (group === undefined || groupAddress === undefined) {
    return (
      <Card>
        <p className="text-sm text-neutral-500">
          Group #{id} could not be read
          {snapshot.error === null || snapshot.error === undefined
            ? '.'
            : `: ${snapshot.error.message}`}
        </p>
      </Card>
    );
  }

  const isMember = (position.data ?? 0) > 0;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500">#{id}</span>
            <AddressChip value={groupAddress} />
            {isMember ? (
              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
                member
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-sm">
            <span className="font-mono">{formatUsdc(group.config.contributionAmount)} USDC</span>{' '}
            per round · {group.memberCount} of {group.config.memberCapacity} members ·{' '}
            <span className="text-neutral-600 dark:text-neutral-400">{group.status}</span>
          </p>
        </div>
        <Link
          to={`/app/groups/${groupAddress}`}
          className="text-sm font-medium underline underline-offset-2"
        >
          Open
        </Link>
      </div>
    </Card>
  );
}

export function Groups() {
  const navigate = useNavigate();
  const count = useGroupCount();
  const [openAddress, setOpenAddress] = useState('');

  const total = count.data ?? 0;
  const newest = total;
  const oldest = Math.max(1, total - SCAN_LIMIT + 1);
  const ids: number[] = [];
  for (let id = newest; id >= oldest; id -= 1) ids.push(id);

  return (
    <Page>
      <PageHeader
        title="Groups"
        description="Groups deployed through the Factory."
        actions={
          <span className="flex items-center gap-2">
            <WalletButton />
            <Link
              to="/app/groups/create"
              className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
            >
              Create
            </Link>
          </span>
        }
      />

      <div className="mt-8 space-y-6">
        <Card>
          <Field
            label="Open a group by address"
            name="group-address"
            placeholder="C…"
            value={openAddress}
            onChange={(event) => setOpenAddress(event.target.value.trim())}
            hint="Groups are contracts. Their addresses are public and safe to share — that is what an invite link contains."
          />
          <div className="mt-3">
            <Button
              variant="secondary"
              disabled={!/^C[A-Z2-7]{55}$/.test(openAddress)}
              onClick={() => void navigate(`/app/groups/${openAddress}`)}
            >
              Open group
            </Button>
          </div>
        </Card>

        {count.isPending ? (
          <p className="flex items-center gap-2 text-sm text-neutral-500">
            <Spinner /> Counting groups…
          </p>
        ) : null}

        {count.isError ? (
          <Notice tone="danger" title="Could not reach the Factory">
            {count.error.message}
          </Notice>
        ) : null}

        {count.isSuccess && total === 0 ? (
          <Notice tone="neutral" title="No groups yet">
            Once a group is created it will appear here. Creating one deploys its own contract.
          </Notice>
        ) : null}

        {total > SCAN_LIMIT ? (
          <Notice tone="neutral" title={`Showing the ${SCAN_LIMIT} most recent of ${total} groups`}>
            Group history is not indexed yet, so older groups are reached by their address rather
            than listed here.
          </Notice>
        ) : null}

        <div className="space-y-3">
          {ids.map((id) => (
            <GroupRow key={id} id={id} />
          ))}
        </div>
      </div>
    </Page>
  );
}
