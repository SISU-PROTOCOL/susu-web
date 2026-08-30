import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useIndexedGroups } from '@/lib/api/hooks';
import { apiErrorMessage } from '@/lib/api/errors';
import { useGroupCount } from '@/lib/susu/hooks';
import { IndexedGroupCard } from '@/components/IndexedGroupCard';
import { Button, Card, Field, Notice, Page, PageHeader, Spinner } from '@/components/ui';
import { WalletButton } from '@/components/WalletButton';

/**
 * Groups.
 *
 * THIS USED TO SCAN
 * The first version of this screen walked the Factory's group ids and read each
 * one from the chain, showing the most recent handful and admitting that older
 * ones were unreachable. That was honest but incomplete: a list that stops at
 * twelve is not a list, and the id-to-address walk costs one RPC round trip per
 * group. Now the index answers it, completely and in one request.
 *
 * WHAT THE INDEX IS FOR HERE
 * Enumeration. The chain has no way to list groups — a group is addressed by the
 * hash of its own deployment — so a complete list can only come from something
 * that watched every group's creation. That is what the indexer is.
 *
 * The trade is freshness: the index lags the chain by up to one indexing run. So
 * this screen never acts on what it lists; each row links to the group page, which
 * reads the contract. And because an index can also simply be behind, the Factory's
 * own count is shown alongside when the two disagree — a mismatch is worth saying
 * rather than hiding, and hiding it would mean presenting an incomplete list as
 * though it were everything.
 */

/** A group address: `C` followed by 55 base-32 characters. */
const CONTRACT_ID_PATTERN = /^C[A-Z2-7]{55}$/;

export function Groups() {
  const navigate = useNavigate();
  const groups = useIndexedGroups();
  const factoryCount = useGroupCount();
  const [openAddress, setOpenAddress] = useState('');

  const items = groups.data?.pages.flatMap((page) => page.items) ?? [];
  const lastPage = groups.data?.pages.at(-1);

  // Only meaningful once both have answered, and only when they disagree in the
  // direction that loses rows.
  const indexedBehind =
    groups.isSuccess &&
    factoryCount.data !== undefined &&
    factoryCount.data > items.length &&
    lastPage?.hasMore !== true;

  return (
    <Page>
      <PageHeader
        title="Groups"
        description="Every group deployed through the Factory, as recorded by the protocol index."
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
              disabled={!CONTRACT_ID_PATTERN.test(openAddress)}
              onClick={() => void navigate(`/app/groups/${openAddress}`)}
            >
              Open group
            </Button>
          </div>
        </Card>

        {groups.isPending ? (
          <p className="flex items-center gap-2 text-sm text-neutral-500">
            <Spinner /> Reading the index…
          </p>
        ) : null}

        {groups.isError ? (
          <Notice tone="warning" title="Groups could not be listed">
            {apiErrorMessage(groups.error)} A group can still be opened by its address above.
          </Notice>
        ) : null}

        {indexedBehind ? (
          <Notice tone="warning" title="The index is behind the Factory">
            The Factory reports {factoryCount.data} group{factoryCount.data === 1 ? '' : 's'} and
            the index has {items.length}. The indexer may not have run yet, so this list can be
            missing recent groups.
          </Notice>
        ) : null}

        {groups.isSuccess && items.length === 0 && !indexedBehind ? (
          <Notice tone="neutral" title="No groups yet">
            Once a group is created it will appear here. Creating one deploys its own contract.
          </Notice>
        ) : null}

        {items.length === 0 ? null : (
          <ul className="space-y-3">
            {items.map((group) => (
              <li key={group.contractId}>
                <IndexedGroupCard group={group} />
              </li>
            ))}
          </ul>
        )}

        {lastPage?.hasMore === true ? (
          <Button
            variant="secondary"
            pending={groups.isFetchingNextPage}
            onClick={() => void groups.fetchNextPage()}
          >
            Show more groups
          </Button>
        ) : null}

        {items.length === 0 ? null : (
          <p className="text-xs text-neutral-500">
            Listed from the protocol index, which trails the chain by up to one indexing run. Open a
            group to read its current state from the contract.
          </p>
        )}
      </div>
    </Page>
  );
}
