import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { signOutOtherSessions, updatePassword } from '@/lib/auth/actions';
import { authErrorFromUrl, type AuthError } from '@/lib/auth/errors';
import { useAuth } from '@/lib/auth/context';
import {
  resetPasswordSchema,
  validate,
  type FieldErrors,
  type ResetPasswordValues,
} from '@/lib/auth/validation';
import { Button, Field, Notice, Spinner } from '@/components/ui';
import { AuthShell } from './AuthShell';

/**
 * Choose a new password.
 *
 * THREE WAYS TO ARRIVE HERE
 *   * Following a reset link. The provider puts a short-lived session in the URL
 *     fragment and the client establishes it, so a session exists by the time
 *     this renders.
 *   * Following a link that has expired or was already used. The provider
 *     reports that in the URL fragment rather than through an API failure, so
 *     `authErrorFromUrl` is what turns it into something the user can act on.
 *     Without that check the page would sit waiting for a session that is never
 *     coming.
 *   * Signed in already, changing a password. Same form, and the distinction
 *     does not affect anything here.
 *
 * WHY THE OTHER SESSIONS ARE REVOKED
 * A password is usually reset because the user believes someone else has access
 * to the account. Changing it does not by itself remove that access — the other
 * party holds a refresh token that stays valid — so the reset would appear to
 * succeed while changing nothing. Every other session is therefore ended once
 * the new password is set.
 */
export function ResetPassword() {
  const navigate = useNavigate();
  const { status, user } = useAuth();

  // Read once, at first render. Parsing on every render would re-report a
  // fragment that the user cannot change, and could resurrect a message they
  // have already moved past.
  const [linkError] = useState<AuthError | undefined>(() => authErrorFromUrl(window.location.href));

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors<ResetPasswordValues>>({});
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [failure, setFailure] = useState<AuthError | undefined>(undefined);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFailure(undefined);
    setFormError(undefined);

    const checked = validate(resetPasswordSchema, { password, confirmPassword });
    if (!checked.ok) {
      setErrors(checked.errors);
      setFormError(checked.form);
      return;
    }

    setErrors({});
    setPending(true);
    const result = await updatePassword(checked.values.password);

    if (!result.ok) {
      setPending(false);
      setFailure(result.error);
      return;
    }

    // Best-effort, and deliberately not fatal. The password has already
    // changed, which is the user's actual goal; failing the whole screen because
    // the revocation call did not go through would leave them believing the
    // password had not been set.
    await signOutOtherSessions();
    setPending(false);

    void navigate('/app', { replace: true });
  }

  /** The remedy for every unusable-link case, so it is written once. */
  const unusableLink = (
    <AuthShell
      title="This link cannot be used"
      subtitle="Reset links expire quickly and work only once."
      footer={
        <Link to="/login" className="font-medium underline">
          Back to log in
        </Link>
      }
    >
      <Notice tone="warning" title="Request a new link">
        <p className="mt-1">
          Open{' '}
          <Link to="/forgot-password" className="font-medium underline">
            reset your password
          </Link>{' '}
          again and we will send a fresh link. The most recent email is the one that works.
        </p>
      </Notice>
    </AuthShell>
  );

  if (linkError !== undefined) return unusableLink;

  if (status === 'loading') {
    return (
      <AuthShell title="Choose a new password" subtitle="Checking your reset link…">
        <div className="flex items-center gap-3 text-sm text-neutral-500">
          <Spinner />
          <span>Verifying the link…</span>
        </div>
      </AuthShell>
    );
  }

  // No session and no reported error means the link was opened without its
  // token — a copied URL, a bookmark, or a direct visit. It is still unusable,
  // so it gets the same remedy rather than a form that cannot succeed.
  if (status === 'anonymous') return unusableLink;

  return (
    <AuthShell
      title="Choose a new password"
      subtitle={
        user?.email === undefined
          ? 'Setting a new password signs you out of every other device.'
          : `Setting a new password for ${user.email} signs you out of every other device.`
      }
      footer={
        <Link to="/app" className="font-medium underline">
          Cancel
        </Link>
      }
    >
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        {failure === undefined ? null : <Notice tone="danger" title={failure.message} />}
        {formError === undefined ? null : <Notice tone="danger" title={formError} />}

        <Field
          label="New password"
          name="password"
          type="password"
          autoComplete="new-password"
          value={password}
          disabled={pending}
          error={errors.password}
          onChange={(event) => setPassword(event.target.value)}
        />

        <Field
          label="Confirm new password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          disabled={pending}
          error={errors.confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
        />

        <Button type="submit" pending={pending} className="w-full">
          Set new password
        </Button>
      </form>
    </AuthShell>
  );
}
