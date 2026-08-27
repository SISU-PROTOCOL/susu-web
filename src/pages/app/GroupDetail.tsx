import { useParams } from 'react-router';
import { formatUsdc, splitPayout } from '@/lib/susu/amounts';
import {
  useContribute,
  useExecutePayout,
  useGroupSnapshot,
  useJoinGroup,
  useMemberPosition,
  usePayoutOrder,
  useRound,
  useStartGroup,
} from '@/lib/susu/hooks';
import { useWallet } from '@/lib/wallet/context';
import { InvitePanel } from '@/components/InvitePanel';
import { OutcomeNotice } from '@/components/OutcomeNotice';
import { AddressChip, Button, Card, Notice, Page, PageHeader, Spinner } from '@/components/ui';
import { WalletButton } from '@/components/WalletButton';

/**
 * A single group.
 *
 * Every figure on this screen is read from the chain, and every action is a
 * request the contract may refuse. The screen's own checks exist to avoid
 * pointless signature prompts — they are not the rules. The rules are on-chain,
 * and a refusal comes back here as an explanation rather than a crash.
 */

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs tracking-wide text-neutral-500 uppercase">{label}</dt>
      <dd className="mt-0.5 font-mono text-sm">{value}</dd>
    </div>
  );
}

export function GroupDetail() {
  const { id } = useParams<{ id: string }>();
  const groupAddress = id;
  const { address, status } = useWallet();

  const snapshot = useGroupSnapshot(groupAddress);
  const position = useMemberPosition(groupAddress, address);
  const group = snapshot.data;

  const currentRound = group?.currentRound ?? 0;
  const round = useRound(groupAddress, currentRound);
  const payoutOrder = usePayoutOrder(groupAddress);

  const join = useJoinGroup(groupAddress);
  const start = useStartGroup(groupAddress);
  const contribute = useContribute(groupAddress);
  const payout = useExecutePayout(groupAddress);

  if (snapshot.isPending) {
    return (
      <Page>
        <p className="flex items-center gap-2 text-sm text-neutral-500">
          <Spinner /> Reading this group from the network…
        </p>
      </Page>
    );
  }

  if (snapshot.isError || group === undefined) {
    return (
      <Page>
        <PageHeader title="Group unavailable" />
        <div className="mt-6">
          <Notice tone="danger" title="This group could not be read">
            {snapshot.error?.message ?? 'The network returned no state for this address.'}
          </Notice>
        </div>
      </Page>
    );
  }

  const { config, status: groupStatus, memberCount, roundPhase } = group;
  const isMember = (position.data ?? 0) > 0;
  const isFull = memberCount >= config.memberCapacity;
  const isConnected = status === 'connected' && address !== undefined;

  const roundData = round.data;
  const contributionsIn = roundData?.contributionCount ?? 0;
  const recipient = roundData?.recipient;
  const roundComplete = roundPhase === 'ReadyForPayout';

  const split = splitPayout(
    config.contributionAmount * BigInt(config.memberCapacity),
    config.feeBps,
  );

  return (
    <Page>
      <PageHeader
        title="Group"
        description={<AddressChip value={groupAddress ?? ''} />}
        actions={<WalletButton />}
      />

      <div className="mt-8 space-y-6">
        <Card>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Status" value={groupStatus} />
            <Stat label="Members" value={`${memberCount} / ${config.memberCapacity}`} />
            <Stat label="Contribution" value={`${formatUsdc(config.contributionAmount)} USDC`} />
            <Stat
              label="Round"
              value={
                currentRound === 0 ? 'Not started' : `${currentRound} of ${config.memberCapacity}`
              }
            />
          </dl>

          <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-neutral-200 pt-5 sm:grid-cols-3 dark:border-neutral-800">
            <Stat
              label="Round pool when full"
              value={`${formatUsdc(split.fee + split.recipientAmount)} USDC`}
            />
            <Stat label="Recipient receives" value={`${formatUsdc(split.recipientAmount)} USDC`} />
            <Stat label="Protocol fee" value={`${formatUsdc(split.fee)} USDC`} />
          </dl>
        </Card>

        {groupStatus === 'Active' && roundData !== undefined ? (
          <Card>
            <h2 className="text-sm font-medium">
              Round {currentRound} ·{' '}
              {roundPhase === 'ReadyForPayout' ? 'ready to pay out' : 'collecting contributions'}
            </h2>
            <dl className="mt-3 grid grid-cols-2 gap-4">
              <Stat label="Contributed" value={`${contributionsIn} of ${memberCount} members`} />
              <Stat label="Received so far" value={`${formatUsdc(roundData.pool)} USDC`} />
            </dl>

            {recipient === undefined ? null : (
              <p className="mt-4 text-sm text-neutral-600 dark:text-neutral-400">
                This round pays <AddressChip value={recipient} />.
              </p>
            )}

            {roundData.contributionCount < memberCount ? (
              <div className="mt-4">
                <Notice tone="neutral" title="This round is waiting">
                  A payout is not possible until every member has contributed. Nobody is skipped and
                  no one loses their turn — the round simply waits.
                </Notice>
              </div>
            ) : null}
          </Card>
        ) : null}

        {payoutOrder.data === undefined || payoutOrder.data.length === 0 ? null : (
          <Card>
            <h2 className="text-sm font-medium">Payout order</h2>
            <p className="mt-1 text-xs text-neutral-500">
              Fixed when each member joined, and immutable afterwards.
            </p>
            <ol className="mt-3 space-y-1.5 text-sm">
              {payoutOrder.data.map((member, index) => (
                <li key={member} className="flex items-center gap-3">
                  <span className="w-5 text-right font-mono text-xs text-neutral-500">
                    {index + 1}
                  </span>
                  <AddressChip value={member} />
                  {member === address ? (
                    <span className="text-xs text-neutral-500">you</span>
                  ) : null}
                </li>
              ))}
            </ol>
          </Card>
        )}

        {isConnected ? null : (
          <Notice tone="neutral" title="Connect a wallet to take part">
            Reading a group needs no wallet. Joining, contributing and paying out require an account
            to sign for.
          </Notice>
        )}

        <div className="space-y-4">
          {groupStatus === 'Open' ? (
            <Card>
              <h2 className="text-sm font-medium">Membership is open</h2>
              <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                {isFull
                  ? 'Every place is filled. The group can now start.'
                  : `${config.memberCapacity - memberCount} place${config.memberCapacity - memberCount === 1 ? '' : 's'} remaining.`}
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                {isMember ? (
                  <p className="text-sm text-neutral-500">You are member #{position.data}.</p>
                ) : (
                  <Button
                    disabled={!isConnected || isFull}
                    pending={join.isPending}
                    onClick={() => join.mutate()}
                  >
                    {isFull ? 'Group is full' : 'Join this group'}
                  </Button>
                )}

                {/* Start is permissionless once full — any member may call it,
                    and the contract checks the capacity itself. */}
                <Button
                  variant="secondary"
                  disabled={!isConnected || !isFull}
                  pending={start.isPending}
                  onClick={() => start.mutate()}
                >
                  Start the group
                </Button>
              </div>

              {join.data === undefined ? null : (
                <div className="mt-4">
                  <OutcomeNotice outcome={join.data} />
                </div>
              )}
              {start.data === undefined ? null : (
                <div className="mt-4">
                  <OutcomeNotice outcome={start.data} />
                </div>
              )}
            </Card>
          ) : null}

          {groupStatus === 'Active' ? (
            <Card>
              <h2 className="text-sm font-medium">Round {currentRound}</h2>
              <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                Contributing sends exactly {formatUsdc(config.contributionAmount)} USDC from your
                account to this group&rsquo;s contract. The contract accepts no other amount and no
                other asset.
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button
                  disabled={!isConnected || !isMember}
                  pending={contribute.isPending}
                  onClick={() =>
                    contribute.mutate({
                      amount: config.contributionAmount,
                      round: currentRound,
                    })
                  }
                >
                  Contribute {formatUsdc(config.contributionAmount)} USDC
                </Button>

                {/* Permissionless, but the contract refuses an unfunded round.
                    Calling it early cannot release money early. */}
                <Button
                  variant="secondary"
                  disabled={!isConnected || !roundComplete}
                  pending={payout.isPending}
                  onClick={() => payout.mutate()}
                >
                  Pay out this round
                </Button>
              </div>

              {isMember ? null : (
                <p className="mt-3 text-xs text-neutral-500">
                  Only members of this group can contribute.
                </p>
              )}

              {contribute.data === undefined ? null : (
                <div className="mt-4">
                  <OutcomeNotice outcome={contribute.data} />
                </div>
              )}
              {payout.data === undefined ? null : (
                <div className="mt-4">
                  <OutcomeNotice outcome={payout.data} />
                </div>
              )}
            </Card>
          ) : null}

          {groupStatus === 'Completed' ? (
            <Notice tone="success" title="This group has completed every round">
              Each member has received the pool exactly once. The contract holds nothing.
            </Notice>
          ) : null}

          {/* Offered once the page has read this account's membership from the
              chain. A UI affordance rather than a rule: the API imposes no such
              check, because it has no way to make one. */}
          {isMember && groupAddress !== undefined ? (
            <InvitePanel groupContractId={groupAddress} />
          ) : null}
        </div>
      </div>
    </Page>
  );
}
