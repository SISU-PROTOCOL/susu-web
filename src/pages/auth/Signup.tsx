import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { signUp } from '@/lib/auth/actions';
import { useAuth } from '@/lib/auth/context';
import type { AuthError } from '@/lib/auth/errors';
import {
  MIN_PASSWORD_LENGTH,
  signUpSchema,
  validate,
  type SignUpValues,
} from '@/lib/auth/validation';
import { Button, Field, Notice } from '@/components/ui';
import { AuthShell } from './AuthShell';

/**
 * Create an account.
 *
 * TWO OUTCOMES, ONE MESSAGE
 * With email confirmation enabled, a successful signup establishes no session,
 * so the page switches to telling the user to check their inbox. That is not an
 * error state and must not be dressed as one — a red panel after a successful
 * signup teaches people the app is broken.
 *
 * The other thing this screen refuses to do is reveal whether an address is
 * already registered. Supabase answers an existing address with a
 * success-shaped response and no session precisely so the caller cannot tell,
 * and `signUp` passes that through unchanged. So the confirmation panel is
 * shown for both cases, which also happens to be the correct message for the
 * user who forgot they had an account — there is a link to sign in beside it.
 */
export function Signup() {
  const navigate = useNavigate();
  const { status } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<Partial<Record<keyof SignUpValues, string>>>({});
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [failure, setFailure] = useState<AuthError | undefined>(undefined);
  const [pending, setPending] = useState(false);
  const [sentTo, setSentTo] = useState<string | undefined>(undefined);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFailure(undefined);
    setFormError(undefined);

    const checked = validate(signUpSchema, { email, password, confirmPassword });
    if (!checked.ok) {
      setErrors(checked.errors);
      setFormError(checked.form);
      return;
    }

    setErrors({});
    setPending(true);
    const result = await signUp({ email: checked.values.email, password: checked.values.password });
    setPending(false);

    if (!result.ok) {
      setFailure(result.error);
      return;
    }

    // No session means the address must be confirmed before it can be used.
    // This happens whether or not the address was already registered, which is
    // the point: the screen cannot leak what it does not know.
    if (result.data.needsVerification) {
      setSentTo(checked.values.email);
      return;
    }

    void navigate('/app', { replace: true });
  }

  // A signed-in user does not need the signup form. This also covers the case
  // where confirmation is disabled, so signup returned a session and the user
  // is authenticated before the explicit navigation lands.
  if (status === 'authenticated') return <Navigate to="/app" replace />;

  if (sentTo !== undefined) {
    return (
      <AuthShell
        title="Check your email"
        subtitle="Your account is not active yet."
        footer={
          <>
            Already have an account?{' '}
            <Link to="/login" className="font-medium underline">
              Log in
            </Link>
          </>
        }
      >
        <Notice tone="success" title={`Confirmation link sent to ${sentTo}`}>
          <p className="mt-1">
            Open the link in that email to activate your account. If you do not see it within a few
            minutes, check your spam folder.
          </p>
          <p className="mt-3">
            Still nothing?{' '}
            <Link to="/login" className="font-medium underline">
              Go to log in
            </Link>{' '}
            and ask for another confirmation email.
          </p>
        </Notice>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Susu Protocol never holds your funds. Your account lets you track groups; a wallet is what moves money, and it is linked separately."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium underline">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        {failure === undefined ? null : <Notice tone="danger" title={failure.message} />}
        {formError === undefined ? null : <Notice tone="danger" title={formError} />}

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
          autoComplete="new-password"
          value={password}
          disabled={pending}
          error={errors.password}
          hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
          onChange={(event) => setPassword(event.target.value)}
        />

        <Field
          label="Confirm password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          disabled={pending}
          error={errors.confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
        />

        <Button type="submit" pending={pending} className="w-full">
          Create account
        </Button>
      </form>
    </AuthShell>
  );
}
