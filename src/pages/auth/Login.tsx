import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { resendConfirmation, signIn } from '@/lib/auth/actions';
import { useAuth } from '@/lib/auth/context';
import { canResendEmail, type AuthError } from '@/lib/auth/errors';
import { safeRedirect } from '@/lib/auth/redirect';
import {
  emailSchema,
  signInSchema,
  validate,
  type FieldErrors,
  type SignInValues,
} from '@/lib/auth/validation';
import { Button, Field, Notice } from '@/components/ui';
import { AuthShell } from './AuthShell';

/**
 * Sign in.
 *
 * A failure is rendered from the `AuthError` code rather than from the
 * provider's message, and that is what makes the `email-not-confirmed` case
 * workable: it is the one failure where the user has a valid account and still
 * cannot get in, so the screen offers the thing that actually helps — another
 * confirmation email — instead of repeating the problem back at them.
 */
export function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { status } = useAuth();

  // Where the user was headed before `RequireAuth` intervened. Passed through
  // `safeRedirect` because navigation state is a client-side channel and a
  // crafted value here would make this page an open redirect.
  const state = location.state as { from?: unknown } | null;
  const destination = safeRedirect(state?.from);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors<SignInValues>>({});
  const [failure, setFailure] = useState<AuthError | undefined>(undefined);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | undefined>(undefined);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFailure(undefined);
    setNotice(undefined);

    const checked = validate(signInSchema, { email, password });
    if (!checked.ok) {
      setErrors(checked.errors);
      return;
    }

    setErrors({});
    setPending(true);
    const result = await signIn(checked.values);
    setPending(false);

    if (!result.ok) {
      setFailure(result.error);
      return;
    }

    // `replace` so that going back does not return to the login form the user
    // has just successfully left.
    void navigate(destination, { replace: true });
  }

  async function onResend(): Promise<void> {
    // Only the address is needed here, so it is validated on its own. Validating
    // the whole form would refuse to send a confirmation email because the
    // password field — which this action does not use — was empty.
    const checked = emailSchema.safeParse(email);
    if (!checked.success) {
      setErrors({ email: checked.error.issues[0]?.message ?? 'Enter your email address.' });
      return;
    }

    setErrors({});
    setNotice(undefined);
    setPending(true);
    const result = await resendConfirmation(checked.data);
    setPending(false);

    if (!result.ok) {
      setFailure(result.error);
      return;
    }

    setNotice(`Confirmation email sent to ${checked.data}.`);
  }

  // A signed-in user has no business on the login form. Returning early also
  // covers the beat after a successful sign-in, when the provider has reported
  // the new session but the explicit navigation has not landed yet.
  if (status === 'authenticated') return <Navigate to={destination} replace />;

  return (
    <AuthShell
      title="Log in"
      subtitle="Sign in to see your groups, contributions and payouts."
      footer={
        <>
          New here?{' '}
          <Link to="/signup" className="font-medium underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        {failure === undefined ? null : (
          <Notice tone="danger" title={failure.message}>
            {canResendEmail(failure) ? (
              <Button variant="secondary" onClick={onResend} pending={pending} className="mt-2">
                Send a new confirmation email
              </Button>
            ) : null}
          </Notice>
        )}

        {notice === undefined ? null : <Notice tone="success">{notice}</Notice>}

        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          disabled={pending}
          error={errors.email}
          onChange={(event) => setEmail(event.target.value)}
        />

        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          disabled={pending}
          error={errors.password}
          onChange={(event) => setPassword(event.target.value)}
        />

        <Button type="submit" pending={pending} className="w-full">
          Log in
        </Button>

        <p className="text-center text-sm">
          <Link to="/forgot-password" className="text-neutral-600 underline dark:text-neutral-400">
            Forgot your password?
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
