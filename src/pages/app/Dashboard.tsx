import { Link } from 'react-router';
import { useFactoryConfig, useGroupCount } from '@/lib/susu/hooks';
import { useStellar } from '@/lib/stellar/hooks';
import { useWallet } from '@/lib/wallet/context';
import { AddressChip, Card, Notice, Page, PageHeader, Spinner } from '@/components/ui';
import { WalletButton } from '@/components/WalletButton';

/**
 * Overview.
 *
 * Everything shown here is read from chain or from configuration. There are no
 * simulated balances and no placeholder figures: a number on this screen is a
 * number the network reported.
 */
export function Dashboard() {
  const { contracts, network } = useStellar();
  const { status, address } = useWallet();
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
        {status === 'connected' && address !== undefined ? (
          <Card>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">Connected as</p>
            <div className="mt-1">
              <AddressChip value={address} />
            </div>
          </Card>
        ) : (
          <Notice tone="neutral" title="No wallet connected">
            Connect a wallet to create a group, join one, or contribute. Browsing needs no wallet.
          </Notice>
        )}

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
