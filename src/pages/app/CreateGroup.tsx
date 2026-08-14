import { useState } from 'react';
import { useNavigate } from 'react-router';
import { amountErrorMessage, formatUsdc, parseUsdc, splitPayout } from '@/lib/susu/amounts';
import { useCreateGroup } from '@/lib/susu/hooks';
import { useStellar } from '@/lib/stellar/hooks';
import { useWallet } from '@/lib/wallet/context';
import { OutcomeNotice } from '@/components/OutcomeNotice';
import { Button, Card, Field, Page, PageHeader, Notice, SelectField } from '@/components/ui';
import { WalletButton } from '@/components/WalletButton';

/**
 * Create a group.
 *
 * The preview shown here is computed locally and labelled as such: it is the
 * contract's arithmetic mirrored for the user's benefit, not an authority. What
 * the group actually charges and pays is decided on-chain.
 */

const FREQUENCIES = [
  { label: 'Every day', seconds: 86_400n },
  { label: 'Every week', seconds: 604_800n },
  { label: 'Every two weeks', seconds: 1_209_600n },
  { label: 'Every month', seconds: 2_592_000n },
] as const;

const MIN_MEMBERS = 2;
const MAX_MEMBERS = 100;

export function CreateGroup() {
  const navigate = useNavigate();
  const { contracts } = useStellar();
  const { status, address } = useWallet();
  const createGroup = useCreateGroup();

  const [capacity, setCapacity] = useState('3');
  const [amount, setAmount] = useState('10');
  const [frequencyIndex, setFrequencyIndex] = useState(1);

  const parsedAmount = parseUsdc(amount);
  const capacityNumber = Number.parseInt(capacity, 10);
  const capacityValid =
    Number.isInteger(capacityNumber) &&
    capacityNumber >= MIN_MEMBERS &&
    capacityNumber <= MAX_MEMBERS;

  const frequency = FREQUENCIES[frequencyIndex];
  const canSubmit =
    parsedAmount.ok && capacityValid && status === 'connected' && address !== undefined;

  // Mirrors the contract so the user can see the split before committing to it.
  const preview =
    parsedAmount.ok && capacityValid
      ? splitPayout(parsedAmount.stroops * BigInt(capacityNumber), 50)
      : undefined;

  const outcome = createGroup.data;

  return (
    <Page>
      <PageHeader
        title="Create a Susu group"
        description="Set the terms. Creating the group deploys its own Soroban contract through the Factory, and the terms cannot be changed afterwards by anyone — including whoever creates it."
        actions={<WalletButton />}
      />

      <div className="mt-8 space-y-6">
        <Card>
          <div className="space-y-5">
            <Field
              label="Contribution amount (USDC)"
              name="amount"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              hint="Every member contributes exactly this much each round. USDC supports up to 7 decimal places."
              error={parsedAmount.ok ? undefined : amountErrorMessage(parsedAmount.error)}
            />

            <Field
              label="Number of members"
              name="capacity"
              inputMode="numeric"
              value={capacity}
              onChange={(event) => setCapacity(event.target.value)}
              hint={`Between ${MIN_MEMBERS} and ${MAX_MEMBERS}. This is also the number of rounds — every member receives the pool exactly once.`}
              error={
                capacityValid
                  ? undefined
                  : `Enter a whole number between ${MIN_MEMBERS} and ${MAX_MEMBERS}.`
              }
            />

            <SelectField
              label="How often members contribute"
              name="frequency"
              value={String(frequencyIndex)}
              onChange={(event) => setFrequencyIndex(Number(event.target.value))}
              hint="Nominal cadence. A round is gated by contributions, never by the clock: if someone misses, the round waits rather than skipping them."
            >
              {FREQUENCIES.map((option, index) => (
                <option key={option.label} value={index}>
                  {option.label}
                </option>
              ))}
            </SelectField>
          </div>
        </Card>

        {preview === undefined ? null : (
          <Card>
            <h2 className="text-sm font-medium">If every member pays in</h2>
            <dl className="mt-3 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-neutral-600 dark:text-neutral-400">Each round&rsquo;s pool</dt>
                <dd className="font-mono">
                  {formatUsdc(preview.fee + preview.recipientAmount)} USDC
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-600 dark:text-neutral-400">
                  Recipient receives <span className="opacity-70">(0.50% fee)</span>
                </dt>
                <dd className="font-mono">{formatUsdc(preview.recipientAmount)} USDC</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-600 dark:text-neutral-400">Protocol fee</dt>
                <dd className="font-mono">{formatUsdc(preview.fee)} USDC</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-neutral-500">
              An estimate. The contract computes the actual split on-chain, truncating the fee so
              rounding always favours the recipient.
            </p>
          </Card>
        )}

        {status !== 'connected' ? (
          <Notice tone="neutral" title="Connect a wallet to create a group">
            The group is deployed by a transaction that you sign. Nothing is created until that
            transaction is confirmed on-chain.
          </Notice>
        ) : null}

        {outcome === undefined ? null : <OutcomeNotice outcome={outcome} />}

        <div className="flex items-center gap-3">
          <Button
            pending={createGroup.isPending}
            disabled={!canSubmit}
            onClick={() => {
              if (!parsedAmount.ok || address === undefined) return;
              createGroup.mutate(
                {
                  // Informational on-chain only: the contract records it but
                  // grants it no authority. It is not, and can never become, a
                  // way to withdraw group funds.
                  creator: address,
                  token: contracts.usdcId,
                  contributionAmount: parsedAmount.stroops,
                  memberCapacity: capacityNumber,
                  frequencySeconds: frequency?.seconds ?? 604_800n,
                },
                {
                  onSuccess: (result) => {
                    if (result.status === 'created') {
                      void navigate(`/app/groups/${result.groupAddress}`);
                    }
                  },
                },
              );
            }}
          >
            Create group
          </Button>
          <p className="text-xs text-neutral-500">
            You will be asked to approve one transaction. Your group is not guaranteed a place —
            joining still requires an explicit join, including for you.
          </p>
        </div>

        {createGroup.error === null || createGroup.error === undefined ? null : (
          <Notice tone="danger" title="Could not create the group">
            {createGroup.error.message}
          </Notice>
        )}
      </div>
    </Page>
  );
}
