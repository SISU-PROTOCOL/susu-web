/**
 * Authentication actions.
 *
 * Every function here returns a result rather than throwing, and every failure
 * is an `AuthError` with a code the UI can branch on. There are two reasons for
 * that shape.
 *
 * A page has to render *something* for every outcome, so an action that throws
 * forces a try/catch at each call site and a guess about what went wrong. And a
 * thrown error at a call site is easy to leave unhandled, which in an auth flow
 * means a button that appears to do nothing.
 *
 * Nothing here decides an identity. These functions call the provider and report
 * what it said; the session that results is established by the provider and
 * observed by `session.tsx`.
 */

import { getSupabaseClient } from '@/lib/supabase';
import { getEnv } from '@/lib/env';
import { AuthError, toAuthError } from './errors';

export type AuthOutcome<T> = { ok: true; data: T } | { ok: false; error: AuthError };

/**
 * Where a confirmation email should return the user.
 *
 * The app root, so a confirmed signup lands in the application already signed
 * in rather than on a page that asks for the password again. These URLs must be
 * listed in Supabase's redirect allowlist or the provider silently uses its
 * site URL instead, landing the user somewhere unexpected.
 */
function confirmRedirect(): string {
  return `${getEnv().VITE_APP_URL}/app`;
}

function recoveryRedirect(): string {
  return `${getEnv().VITE_APP_URL}/reset-password`;
}

/**
 * Creates an account.
 *
 * ALREADY-REGISTERED ADDRESSES ARE NOT REPORTED AS SUCH
 * When the address exists, Supabase returns a success-shaped response with no
 * session and an empty `identities` array, so that a caller cannot tell whether
 * an account was created. Reporting "this email is taken" would turn the signup
 * form into a way to test which addresses are registered, so this function
 * deliberately does not inspect `identities` and reports the same outcome
 * either way. The signup page shows one neutral message for both, and offers a
 * link to sign in for the user who simply forgot they had an account.
 *
 * `needsVerification` reflects whether a session came back. `true` means an
 * email was sent and the address must be confirmed first, which is the normal
 * outcome when confirmations are enabled.
 */
export async function signUp(values: {
  email: string;
  password: string;
}): Promise<AuthOutcome<{ needsVerification: boolean }>> {
  try {
    const { data, error } = await getSupabaseClient().auth.signUp({
      email: values.email,
      password: values.password,
      options: { emailRedirectTo: confirmRedirect() },
    });

    if (error) return { ok: false, error: toAuthError(error) };

    return { ok: true, data: { needsVerification: data.session === null } };
  } catch (cause) {
    return { ok: false, error: toAuthError(cause) };
  }
}

/**
 * Signs in with an email and password.
 *
 * The session this establishes is picked up by the session provider, so this
 * does not need to return it.
 */
export async function signIn(values: {
  email: string;
  password: string;
}): Promise<AuthOutcome<{ userId: string }>> {
  try {
    const { data, error } = await getSupabaseClient().auth.signInWithPassword({
      email: values.email,
      password: values.password,
    });

    if (error) return { ok: false, error: toAuthError(error) };
    if (data.user === null) {
      // A success without a user would leave the caller unable to tell whether
      // anything happened, so it is treated as a malformed response rather than
      // silently reported as success.
      return {
        ok: false,
        error: new AuthError('unknown', 'Sign-in did not return a session.'),
      };
    }

    return { ok: true, data: { userId: data.user.id } };
  } catch (cause) {
    return { ok: false, error: toAuthError(cause) };
  }
}

/**
 * Signs out.
 *
 * By default this revokes the session at the provider as well as clearing it
 * locally. The local clear is what matters for the UI, but leaving the refresh
 * token valid server-side would mean a session that "logged out" could still be
 * used from wherever it was copied.
 */
export async function signOut(): Promise<AuthOutcome<undefined>> {
  try {
    const { error } = await getSupabaseClient().auth.signOut();
    if (error) return { ok: false, error: toAuthError(error) };
    return { ok: true, data: undefined };
  } catch (cause) {
    return { ok: false, error: toAuthError(cause) };
  }
}

/**
 * Sends a password-reset email.
 *
 * Reports success for an address with no account, because the provider does.
 * That is the point: a form that said "no account with that address" would let
 * anyone test which addresses are registered. The UI must therefore show the
 * same message whether or not an email was actually sent, and must not present
 * a failure to "find" the address as an error.
 *
 * A genuine failure — a rate limit, no network — still comes back as one, since
 * those do not depend on whether the account exists.
 */
export async function requestPasswordReset(email: string): Promise<AuthOutcome<undefined>> {
  try {
    const { error } = await getSupabaseClient().auth.resetPasswordForEmail(email, {
      redirectTo: recoveryRedirect(),
    });

    if (error) return { ok: false, error: toAuthError(error) };
    return { ok: true, data: undefined };
  } catch (cause) {
    return { ok: false, error: toAuthError(cause) };
  }
}

/**
 * Sets a new password for the signed-in user.
 *
 * Used by the reset flow, where the emailed link has already established a
 * short-lived session, and by a signed-in user changing their password. It
 * requires a session, and reports `no-session` rather than attempting a call
 * the provider would reject — that arrives as a generic failure which would
 * leave the user with no idea the link had expired.
 */
export async function updatePassword(password: string): Promise<AuthOutcome<undefined>> {
  try {
    const client = getSupabaseClient();
    const { data } = await client.auth.getSession();

    if (data.session === null) {
      return {
        ok: false,
        error: new AuthError(
          'no-session',
          'That link is no longer valid. Request a new one to set your password.',
        ),
      };
    }

    const { error } = await client.auth.updateUser({ password });
    if (error) return { ok: false, error: toAuthError(error) };
    return { ok: true, data: undefined };
  } catch (cause) {
    return { ok: false, error: toAuthError(cause) };
  }
}

/**
 * Sends another confirmation email.
 *
 * Offered when a sign-in fails with `email-not-confirmed`, which is the one case
 * where the user has a real account and cannot get in. Rate-limited by the
 * provider, so a failure here is reported rather than swallowed.
 */
export async function resendConfirmation(email: string): Promise<AuthOutcome<undefined>> {
  try {
    const { error } = await getSupabaseClient().auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: confirmRedirect() },
    });

    if (error) return { ok: false, error: toAuthError(error) };
    return { ok: true, data: undefined };
  } catch (cause) {
    return { ok: false, error: toAuthError(cause) };
  }
}

/**
 * Ends every other session for the signed-in user, keeping this one.
 *
 * Called after a password reset, and the reason is the scenario a reset is
 * usually for. A user resets a password because they believe someone else has
 * access to their account. Changing the password does not by itself take that
 * access away: the other party holds a refresh token that stays valid, so they
 * keep their session and the reset achieves nothing.
 *
 * Revoking the others closes that. The current session is deliberately spared so
 * the user is not signed out of the browser they are standing in, which would
 * look like the reset had failed.
 */
export async function signOutOtherSessions(): Promise<AuthOutcome<undefined>> {
  try {
    const { error } = await getSupabaseClient().auth.signOut({ scope: 'others' });
    if (error) return { ok: false, error: toAuthError(error) };
    return { ok: true, data: undefined };
  } catch (cause) {
    return { ok: false, error: toAuthError(cause) };
  }
}
