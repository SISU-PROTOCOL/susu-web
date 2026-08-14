import { useNavigate, useParams } from 'react-router';
import { formatUsdc } from '@/lib/susu/amounts';
import { useGroupSnapshot, useJoinGroup, useMemberPosition } from '@/lib/susu/hooks';
import { useWallet } from '@/lib/wallet/context';
import { OutcomeNotice } from '@/components/OutcomeNotice';
import { AddressChip, Button, Card, Notice, Page, PageHeader, Spinner } from '@/components/ui';
import { WalletButton } from '@/components/WalletButton';

/**
 * An invite link.
 *
 * The invite code is the group's contract address. It is not a secret and grants
 * nothing — it only says which contract to look at. Joining is still an explicit,
 * signed action, and the contract still decides whether it is allowed.
 */
export function JoinInvite() {
  const { inviteCode } = useParams<{ inviteCode: string }>();
  const navigate = useNavigate();
  const { address, status } = useWallet();

  const groupAddress = inviteCode;
  const snapshot = useGroupSnapshot(groupAddress);
  const position = useMemberPosition(groupAddress, address);
  const join = useJoinGroup(groupAddress);

  const group = snapshot.data;
  const isConnected = status === 'connected' && address !== undefined;
  const isMember = (position.data ?? 0) > 0;

  return (
    <Page>
      <PageHeader
        title="You have been invited to a Susu group"
        description={groupAddress === undefined ? undefined : <AddressChip value={groupAddress} />}
        actions={<WalletButton />}
      />

      <div className="mt-8 space-y-6">
        {snapshot.isPending ? (
          <p className="flex items-center gap-2 text-sm text-neutral-500">
            <Spinner /> Reading the group from the network…
          </p>
        ) : null}

        {snapshot.isError || (snapshot.isSuccess && group === undefined) ? (
          <Notice tone="danger" title="This invite could not be read">
            {snapshot.error?.message ??
              'The address in this link is not a group this app can read.'}
          </Notice>
        ) : null}

        {group === undefined ? null : (
          <>
            <Card>
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-xs tracking-wide text-neutral-500 uppercase">Contribution</dt>
                  <dd className="mt-0.5 font-mono">
                    {formatUsdc(group.config.contributionAmount)} USDC per round
                  </dd>
                </div>
                <div>
                  <dt className="text-xs tracking-wide text-neutral-500 uppercase">Members</dt>
                  <dd className="mt-0.5 font-mono">
                    {group.memberCount} of {group.config.memberCapacity}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs tracking-wide text-neutral-500 uppercase">Status</dt>
                  <dd className="mt-0.5">{group.status}</dd>
                </div>
                <div>
                  <dt className="text-xs tracking-wide text-neutral-500 uppercase">Protocol fee</dt>
                  <dd className="mt-0.5 font-mono">{group.config.feeBps / 100}%</dd>
                </div>
              </dl>
            </Card>

            {isMember ? (
              <Notice tone="success" title="You are already a member of this group">
                <div className="flex items-center gap-3">
                  <span>Your position is #{position.data}.</span>
                  <Button
                    variant="secondary"
                    onClick={() => void navigate(`/app/groups/${groupAddress}`)}
                  >
                    Open group
                  </Button>
                </div>
              </Notice>
            ) : null}

            {!isMember && group.status !== 'Open' ? (
              <Notice tone="warning" title="This group is no longer accepting members">
                Membership closed when the group started. You can still view it, but you cannot
                join.
              </Notice>
            ) : null}

            {!isMember && group.status === 'Open' ? (
              <Card>
                <h2 className="text-sm font-medium">Join this group</h2>
                <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                  Joining commits you to contribute exactly{' '}
                  {formatUsdc(group.config.contributionAmount)} USDC each round until everyone has
                  been paid once. Your position in the payout order is fixed at the moment you join
                  and cannot be changed afterwards.
                </p>

                <div className="mt-4">
                  <Button
                    disabled={!isConnected || group.memberCount >= group.config.memberCapacity}
                    pending={join.isPending}
                    onClick={() =>
                      join.mutate(undefined, {
                        onSuccess: (outcome) => {
                          if (outcome.status === 'confirmed') {
                            void navigate(`/app/groups/${groupAddress}`);
                          }
                        },
                      })
                    }
                  >
                    {group.memberCount >= group.config.memberCapacity
                      ? 'Group is full'
                      : 'Join group'}
                  </Button>
                </div>
              </Card>
            ) : null}

            {join.data === undefined ? null : <OutcomeNotice outcome={join.data} />}

            {!isConnected ? (
              <Notice tone="neutral" title="Connect a wallet to join">
                Reading the group needs no wallet. Joining requires an account to sign for.
              </Notice>
            ) : null}
          </>
        )}
      </div>
    </Page>
  );
}
