import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { apiErrorMessage, ApiError } from '@/lib/api/errors';
import { useRedeemInvite } from '@/lib/api/hooks';
import { looksLikeInviteCode } from '@/lib/api/invites';
import { useAuth } from '@/lib/auth/context';
import { formatUsdc } from '@/lib/susu/amounts';
import { useGroupSnapshot, useJoinGroup, useMemberPosition } from '@/lib/susu/hooks';
import { useWallet } from '@/lib/wallet/context';
import { OutcomeNotice } from '@/components/OutcomeNotice';
import { AddressChip, Button, Card, Notice, Page, PageHeader, Spinner } from '@/components/ui';
import { WalletButton } from '@/components/WalletButton';

/**
 * An invite link: `/join/<code>`.
 *
 * WHERE THE GROUP ADDRESS COMES FROM
 * The code is opaque, so this page cannot know which group it refers to until the
 * server resolves it. That is the whole point of an opaque code — the link no
 * longer contains an address that anyone could enumerate — and it makes the flow
 * two-step: redeem the code, which claims a use and reports the contract, then
 * send the on-chain join.
 *
 * WHY REDEMPTION IS BEHIND A BUTTON
 * Redeeming claims a use of the invite. Doing it on page load would spend a
 * limited invite on everyone who opens the link, including a link preview, a
 * refresh, or someone who reads the page and changes their mind. So it happens on
 * an explicit action, and the page earns that click by explaining what joining
 * commits the visitor to — which needs the group, which needs the code redeemed.
 * The order is genuinely circular, and the honest resolution is to ask first and
 * explain second.
 *
 * A refresh loses the resolved address, so the visitor redeems again. That is
 * safe rather than merely acceptable: redemption is idempotent per
 * (invite, user), so the same person redeeming the same code consumes one use
 * however many times they do it.
 */
export function JoinInvite() {
  const { inviteCode } = useParams<{ inviteCode: string }>();
  const navigate = useNavigate();
  const auth = useAuth();
  const { address, status: walletStatus } = useWallet();
  const redeem = useRedeemInvite();

  // Held in state because the API reports it rather than the link. Memory only:
  // a resolved address in storage would outlive the redemption and let a stale
  // link keep working after the invite was revoked.
  const [groupAddress, setGroupAddress] = useState<string | undefined>(undefined);

  const snapshot = useGroupSnapshot(groupAddress);
  const position = useMemberPosition(groupAddress, address);
  const join = useJoinGroup(groupAddress);

  const group = snapshot.data;
  const isConnected = walletStatus === 'connected' && address !== undefined;
  const isMember = (position.data ?? 0) > 0;

  const code = inviteCode ?? '';
  // Refused on shape before any request, matching the API. A malformed link is a
  // different problem from a code that was not accepted, and saying which is
  // which saves the visitor a pointless round trip.
  const wellFormed = looksLikeInviteCode(code);

  // The API's own distinction, kept rather than flattened: an exhausted invite is
  // the one failure where the caller did nothing wrong and a fresh invite is a
  // real remedy, so it reads as advice instead of as an error.
  const exhausted = redeem.error instanceof ApiError && redeem.error.code === 'invite_exhausted';

  if (!wellFormed) {
    return (
      <Page>
        <PageHeader title="This invite link is not valid" />
        <div className="mt-8">
          <Notice tone="danger" title="The link is malformed">
            The code in this address is not the shape of an invite code. It may have been truncated
            when it was copied — ask for the link again rather than editing it.
          </Notice>
        </div>
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        title="You have been invited to a Susu group"
        description={
          groupAddress === undefined ? (
            <span className="font-mono text-xs">Invite code {code.slice(0, 8)}…</span>
          ) : (
            <AddressChip value={groupAddress} />
          )
        }
        actions={<WalletButton />}
      />

      <div className="mt-8 space-y-6">
        {auth.status === 'loading' ? (
          <p className="flex items-center gap-2 text-sm text-neutral-500">
            <Spinner /> Checking your session…
          </p>
        ) : null}

        {auth.status === 'anonymous' ? (
          <Card>
            <h2 className="text-sm font-medium">Sign in to accept this invitation</h2>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
              An account is what ties this invite to you, so that opening the link twice does not
              use it up twice. You will still need a wallet signature to join the group on-chain.
            </p>
            <div className="mt-4">
              {/* Returned here rather than to the dashboard, so accepting the
                  invitation does not mean finding the link again. */}
              <Link to="/login" state={{ from: `/join/${code}` }}>
                <Button>Sign in</Button>
              </Link>
            </div>
          </Card>
        ) : null}

        {auth.status === 'authenticated' && groupAddress === undefined ? (
          <Card>
            <h2 className="text-sm font-medium">Open this invitation</h2>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
              Next step checks the code with the server and shows you the group. This uses one of
              the invitation&rsquo;s places if it is limited; opening the link alone does not.
            </p>
            <div className="mt-4">
              <Button
                pending={redeem.isPending}
                onClick={() =>
                  redeem.mutate(
                    { code },
                    {
                      onSuccess: (redeemed) => {
                        setGroupAddress(redeemed.groupContractId);
                      },
                    },
                  )
                }
              >
                Continue
              </Button>
            </div>
          </Card>
        ) : null}

        {redeem.isError ? (
          <Notice
            tone={exhausted ? 'warning' : 'danger'}
            title={exhausted ? 'This invitation is used up' : 'This invitation could not be used'}
          >
            {exhausted
              ? 'It had already been used as many times as it allowed. Ask whoever invited you for a new link.'
              : apiErrorMessage(redeem.error)}
          </Notice>
        ) : null}

        {groupAddress === undefined ? null : snapshot.isPending ? (
          <p className="flex items-center gap-2 text-sm text-neutral-500">
            <Spinner /> Reading the group from the network…
          </p>
        ) : null}

        {groupAddress !== undefined &&
        (snapshot.isError || (snapshot.isSuccess && group === undefined)) ? (
          <Notice tone="danger" title="This group could not be read">
            {snapshot.error?.message ??
              'The invitation resolved to an address this app could not read. Nothing was joined.'}
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
