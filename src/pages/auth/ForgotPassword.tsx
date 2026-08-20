import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { requestPasswordReset } from '@/lib/auth/actions';
import type { AuthError } from '@/lib/auth/errors';
import {
  forgotPasswordSchema,
  validate,
  type FieldErrors,
  type ForgotPasswordValues,
} from '@/lib/auth/validation';
import { Button, Field, Notice } from '@/components/ui';
import { AuthShell } from './AuthShell';

/**
 * Request a password-reset email.
 *
 * THE SAME MESSAGE EITHER WAY
 * This screen reports that a link has been sent without saying whether an
 * account exists. That is not politeness — a form that answered "no account with
 * that address" would be a way for anyone to test which addresses are
 * registered, and the addresses here belong to people handling money together.
 *
 * A real failure — a rate limit, no connection — is still shown, because those
 * do not depend on whether the account exists and telling the user to check an
 * inbox that will never receive anything is worse than telling them to wait.
 */
export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<FieldErrors<ForgotPasswordValues>>({});
  const [failure, setFailure] = useState<AuthError | undefined>(undefined);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFailure(undefined);

    const checked = validate(forgotPasswordSchema, { email });
    if (!checked.ok) {
      setErrors(checked.errors);
      return;
    }

    setErrors({});
    setPending(true);
    const result = await requestPasswordReset(checked.values.email);
    setPending(false);

    if (!result.ok) {
      setFailure(result.error);
      return;
    }

    setSent(true);
  }

  if (sent) {
    return (
      <AuthShell
        title="Check your email"
        subtitle="If that address has an account, a reset link is on its way."
        footer={
          <Link to="/login" className="font-medium underline">
            Back to log in
          </Link>
        }
      >
        <Notice tone="neutral" title="What happens next">
          <p className="mt-1">
            Follow the link in the email to choose a new password. The link can only be used once
            and expires shortly after it is sent.
          </p>
          <p className="mt-3">
            Nothing arrived? Check your spam folder, then{' '}
            <button type="button" className="font-medium underline" onClick={() => setSent(false)}>
              try again
            </button>
            .
          </p>
        </Notice>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter the email address on your account and we will send you a link to choose a new password."
      footer={
        <Link to="/login" className="font-medium underline">
          Back to log in
        </Link>
      }
    >
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        {failure === undefined ? null : <Notice tone="danger" title={failure.message} />}

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

        <Button type="submit" pending={pending} className="w-full">
          Send reset link
        </Button>
      </form>
    </AuthShell>
  );
}
