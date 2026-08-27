import { useState } from 'react';
import { apiErrorMessage } from '@/lib/api/errors';
import { useCreateInvite } from '@/lib/api/hooks';
import { inviteLink } from '@/lib/api/invites';
import { useAuth } from '@/lib/auth/context';
import { Button, Card, Field, Notice, SelectField } from './ui';

/**
 * Creating an invite link for a group.
 *
 * THE CODE IS SHOWN ONCE
 * The API stores the code and never returns it again — the table grants no browser
 * role anything, including to its creator — so this panel shows it at the moment
 * it exists and says plainly that it cannot be shown again. A UI that quietly
 * discarded it would leave the creator with an invite they cannot share, and one
 * that promised to show it later would be lying.
 *
 * WHY THIS IS MEMBERS-ONLY IN THE UI BUT NOT IN THE API
 * "Only members may invite" cannot be enforced by the server: it does not know
 * which wallet an account controls unless the account has linked one, and the
 * chain decides membership by address. So this panel is offered to someone whose
 * membership the page has already read from the chain — an affordance, not a rule
 * — and the API deliberately imposes none. Refusing server-side when it cannot
 * check would break inviting for most users and protect nothing, since the group
 * and its contract address are on the public ledger anyway.
 */
export function InvitePanel({ groupContractId }: { groupContractId: string }) {
  const auth = useAuth();
  const create = useCreateInvite(groupContractId);

  const [expiresInHours, setExpiresInHours] = useState('168');
  const [link, setLink] = useState<string | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  const authenticated = auth.status === 'authenticated';

  async function copy(): Promise<void> {
    if (link === undefined) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setCopyFailed(false);
    } catch {
      // Clipboard access can be refused — an insecure origin, a withheld
      // permission. The link is on screen in a selectable field, so this is a
      // degraded path rather than a failure, and saying so is better than a
      // button that appears to do nothing.
      setCopied(false);
      setCopyFailed(true);
    }
  }

  return (
    <Card>
      <h2 className="text-sm font-medium">Invite people</h2>
      <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
        An invite link lets someone find this group without being told its address. It grants
        nothing on its own — the contract still decides who may join, and joining is a signature the
        invitee has to give.
      </p>

      {link === undefined ? (
        <>
          <div className="mt-4 max-w-xs">
            <SelectField
              label="Expires in"
              value={expiresInHours}
              onChange={(event) => setExpiresInHours(event.target.value)}
              hint="A code that never expires cannot be withdrawn after it leaks."
            >
              <option value="24">1 day</option>
              <option value="168">7 days</option>
              <option value="720">30 days</option>
            </SelectField>
          </div>

          <div className="mt-4">
            <Button
              disabled={!authenticated}
              pending={create.isPending}
              onClick={() =>
                create.mutate(
                  { expiresInHours: Number(expiresInHours) },
                  {
                    onSuccess: (invite) => {
                      setLink(inviteLink(invite.code, window.location.origin));
                      setCopied(false);
                      setCopyFailed(false);
                    },
                  },
                )
              }
            >
              Create an invite link
            </Button>
          </div>

          {authenticated ? null : (
            <p className="mt-3 text-xs text-neutral-500">
              Sign in to create an invite. An account is what limits how often a limited code can be
              used.
            </p>
          )}
        </>
      ) : (
        <>
          <div className="mt-4">
            <Field
              label="Invite link"
              readOnly
              value={link}
              onFocus={(event) => event.currentTarget.select()}
              hint="Send this to one person. It is not shown again after you leave this page."
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={() => void copy()}>
              {copied ? 'Copied' : 'Copy link'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setLink(undefined);
                setCopied(false);
                setCopyFailed(false);
                create.reset();
              }}
            >
              Create another
            </Button>
          </div>

          {copyFailed ? (
            <p className="mt-3 text-xs text-neutral-500">
              The clipboard was not available. Select the link above and copy it by hand.
            </p>
          ) : null}
        </>
      )}

      {create.isError ? (
        <div className="mt-4">
          <Notice tone="danger" title="The invite could not be created">
            {apiErrorMessage(create.error)}
          </Notice>
        </div>
      ) : null}
    </Card>
  );
}
