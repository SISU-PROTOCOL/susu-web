import { Link } from 'react-router';
import { useMemberGroups } from '@/lib/api/hooks';
import { apiErrorMessage } from '@/lib/api/errors';
import { useFactoryConfig, useGroupCount } from '@/lib/susu/hooks';
import { useStellar } from '@/lib/stellar/hooks';
import { useWallet } from '@/lib/wallet/context';
import { IndexedGroupCard } from '@/components/IndexedGroupCard';
import { AddressChip, Button, Card, Notice, Page, PageHeader, Spinner } from '@/components/ui';
import { WalletButton } from '@/components/WalletButton';

/**
 * Overview.
 *
 * TWO KINDS OF FACT, KEPT APART
 * The protocol panel and the contract addresses are read from the chain, and the
 * panel is what a member would check before trusting this screen at all: the fee
 * the contract charges and whether new groups are open. The group list is read
 * from the index, because "which groups am I in" is a question the chain cannot
 * answer — nothing on-chain maps an account to the groups it belongs to, and
 * walking every group id to find out is a scan that is wrong at any real size.
 *
 * The index trails the chain by up to one indexing run, which is why every group
 * here links to a page that reads the contract directly. A number on this screen
 * is a number the network reported, and the screen where money moves is the one
 * that asks the network again.
 */

/** What a member can do next, given where their groups are. */
function attentionLine(activeCount: number, openCount: number): string | undefined {
  // At most one suggestion, and only one that is certainly true. Claiming a
  // contribution is due would need to know whether this member has already paid
  // this round, which the group summary does not say — and a dashboard that
  // guesses at an obligation is worse than one that stays quiet.
  if (activeCount > 0) {
    return `${activeCount} group${activeCount === 1 ? ' is' : 's are'} collecting contributions.`;
  }
  if (openCount > 0) {
    return `${openCount} group${openCount === 1 ? ' is' : 's are'} still filling up.`;
  }
  return undefined;
}

function YourGroups() {
  const { status, address } = useWallet();
  const connected = status === 'connected' && address !== undefined;
  const groups = useMemberGroups(connected ? address : undefined);

  if (!connected) {
    return (
      <Card>
        <h2 className="text-sm font-medium">Your groups</h2>
        <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">
          Connect a wallet to see the groups this account belongs to. Browsing needs no wallet.
        </p>
      </Card>
    );
  }

  const items = groups.data?.pages.flatMap((page) => page.items) ?? [];
  const lastPage = groups.data?.pages.at(-1);
  const activeCount = items.filter((group) => group.status === 'active').length;
  const openCount = items.filter((group) => group.status === 'open').length;
  const attention = attentionLine(activeCount, openCount);

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium">Your groups</h2>
        {attention === undefined ? null : <p className="text-xs text-neutral-500">{attention}</p>}
      </div>

      {groups.isPending ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-neutral-500">
          <Spinner /> Reading the index…
        </p>
      ) : null}

      {groups.isError ? (
        <div className="mt-3">
          {/* An unavailable index is not an empty list. Saying "you have no
              groups" here would be a confident answer to a question that was
              never answered — so the failure is named, and the way to reach a
              group you already know the address of is offered instead. */}
          <Notice tone="warning" title="Your groups could not be listed">
            {apiErrorMessage(groups.error)} You can still open a group by its address.
          </Notice>
        </div>
      ) : null}

      {groups.isSuccess && items.length === 0 ? (
        <div className="mt-3 space-y-3">
          <Notice tone="neutral" title="This account is not in a group yet">
            Join one from an invite link, or create one of your own.
          </Notice>
        </div>
      ) : null}

      {items.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {items.map((group) => (
            <li key={group.contractId}>
              <IndexedGroupCard group={group} />
            </li>
          ))}
        </ul>
      ) : null}

      {lastPage?.hasMore === true ? (
        <div className="mt-4">
          <Button
            variant="secondary"
            pending={groups.isFetchingNextPage}
            onClick={() => void groups.fetchNextPage()}
          >
            Show more
          </Button>
        </div>
      ) : null}

      <p className="mt-4 text-xs text-neutral-500">
        Listed from the protocol index, which can lag the chain.{' '}
        <Link to="/app/groups" className="font-medium underline underline-offset-2">
          Browse all groups
        </Link>
      </p>
    </Card>
  );
}

export function Dashboard() {
  const { contracts, network } = useStellar();
  const config = useFactoryConfig();
  const count = useGroupCount();

  return (
    <Page>
      <PageHeader
        title="Overview"
        description="Susu Protocol on Stellar. Contracts hold the funds and enforce the rules; this app only builds the transactions you sign."
        actions={<WalletButton />}
      />

      <div className="mt-8 space-y-6">
        <YourGroups />

        <Card>
          <h2 className="text-sm font-medium">Protocol</h2>

          {config.isPending ? (
            <p className="mt-3 flex items-center gap-2 text-sm text-neutral-500">
              <Spinner /> Reading the Factory…
            </p>
          ) : null}

          {config.isError ? (
            <div className="mt-3">
              <Notice tone="danger" title="The Factory could not be read">
                {config.error.message}
              </Notice>
            </div>
          ) : null}

          {config.data === undefined ? null : (
            <dl className="mt-3 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs tracking-wide text-neutral-500 uppercase">Network</dt>
                <dd className="mt-0.5 font-mono">{network.network}</dd>
              </div>
              <div>
                <dt className="text-xs tracking-wide text-neutral-500 uppercase">Protocol fee</dt>
                <dd className="mt-0.5 font-mono">{config.data.feeBps / 100}%</dd>
              </div>
              <div>
                <dt className="text-xs tracking-wide text-neutral-500 uppercase">New groups</dt>
                <dd className="mt-0.5">{config.data.paused ? 'Paused' : 'Open'}</dd>
              </div>
              <div className="col-span-2 sm:col-span-3">
                <dt className="text-xs tracking-wide text-neutral-500 uppercase">Treasury</dt>
                <dd className="mt-0.5">
                  <AddressChip value={config.data.treasury} />
                </dd>
              </div>
            </dl>
          )}

          {config.data?.paused === true ? (
            <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">
              New group creation is paused. Groups that already exist are unaffected and keep
              running.
            </p>
          ) : null}
        </Card>

        <Card>
          <h2 className="text-sm font-medium">Groups</h2>
          {count.isPending ? (
            <p className="mt-3 flex items-center gap-2 text-sm text-neutral-500">
              <Spinner /> Counting…
            </p>
          ) : null}
          {count.data === undefined ? null : (
            <p className="mt-3 text-sm">
              <span className="font-mono">{count.data}</span> group{count.data === 1 ? '' : 's'}{' '}
              created through this Factory.
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            <Link to="/app/groups" className="font-medium underline underline-offset-2">
              Browse groups
            </Link>
            <Link to="/app/groups/create" className="font-medium underline underline-offset-2">
              Create a group
            </Link>
          </div>
        </Card>

        <Card>
          <h2 className="text-sm font-medium">Contracts</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-neutral-600 dark:text-neutral-400">Factory</dt>
              <dd>
                <AddressChip value={contracts.factoryId} />
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-neutral-600 dark:text-neutral-400">USDC</dt>
              <dd>
                <AddressChip value={contracts.usdcId} />
              </dd>
            </div>
          </dl>
        </Card>
      </div>
    </Page>
  );
}
