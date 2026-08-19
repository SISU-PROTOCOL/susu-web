/**
 * Authentication failures, as the UI needs to understand them.
 *
 * Supabase reports failures with its own vocabulary — a mix of HTTP statuses,
 * machine codes and prose. Those strings are not a contract the UI should read
 * directly: they change between releases, and several distinct causes arrive
 * with messages similar enough that branching on them produces the wrong screen.
 *
 * So every failure is translated once, here, into a code the UI can branch on.
 * The page then decides what to say and what to offer — a retry, a resend, a
 * link to request a new one — rather than guessing from a string.
 */

/** Why an authentication attempt could not be completed. */
export type AuthErrorCode =
  /** The email and password do not match an account. */
  | 'invalid-credentials'
  /** The account exists but its email address has not been confirmed. */
  | 'email-not-confirmed'
  /** The email address is already registered. */
  | 'already-registered'
  /** The password does not meet the project's minimum requirements. */
  | 'weak-password'
  /** The new password matches the one already in use. */
  | 'same-password'
  /** The email address is not a usable address. */
  | 'invalid-email'
  /** Too many attempts. Supabase rate-limits auth endpoints. */
  | 'rate-limited'
  /** A link or code has expired, or was already used. */
  | 'expired-link'
  /** There is no session, so an operation that requires one cannot proceed. */
  | 'no-session'
  /** The provider could not be reached. */
  | 'network'
  /** A failure this module does not recognise. Never silently discarded. */
  | 'unknown';

/**
 * An authentication failure.
 *
 * `message` is safe to render: it is written for the user, describes the
 * problem, and never includes a token, an address, or a distinction that would
 * let a caller discover whether an account exists.
 */
export class AuthError extends Error {
  readonly code: AuthErrorCode;

  constructor(code: AuthErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'AuthError';
    this.code = code;
  }
}

/**
 * User-facing text for each failure.
 *
 * Two choices here are deliberate and worth keeping.
 *
 * First, `invalid-credentials` covers both a wrong password and an address with
 * no account, and says so without distinguishing them. Login is the classic
 * place where a helpful message becomes an account-enumeration oracle: "no such
 * user" confirms which addresses are registered to anyone willing to type them
 * in. One message for both cases closes that.
 *
 * Second, `already-registered` is never raised by signup. Supabase reports an
 * existing address as a success-shaped response precisely so the caller cannot
 * tell, and translating that into "this email is taken" would undo it. The code
 * exists for the paths that legitimately know — a profile update, say — and the
 * signup flow treats every attempt the same way.
 */
const MESSAGES: Record<AuthErrorCode, string> = {
  'invalid-credentials': "That email and password don't match an account.",
  'email-not-confirmed': 'This email address has not been confirmed yet.',
  'already-registered': 'That email address is already registered.',
  'weak-password': 'That password is too short. Use at least 8 characters.',
  'same-password': 'That is the password you are already using.',
  'invalid-email': 'That does not look like an email address.',
  'rate-limited': 'Too many attempts. Wait a moment and try again.',
  'expired-link': 'That link has expired or has already been used.',
  'no-session': 'You are not signed in.',
  network: 'Could not reach the server. Check your connection and try again.',
  unknown: 'Something went wrong. Try again.',
};

/**
 * Maps the provider's `code` field to ours.
 *
 * Supabase's codes are the stable identifier; the prose is not. Where a code is
 * absent this falls through to matching the message, which is best-effort and
 * exists only because some failures (notably network faults) arrive without one.
 */
function codeFromProviderCode(code: string): AuthErrorCode | undefined {
  switch (code) {
    case 'invalid_credentials':
      return 'invalid-credentials';
    case 'email_not_confirmed':
      return 'email-not-confirmed';
    case 'user_already_exists':
    case 'email_exists':
      return 'already-registered';
    case 'weak_password':
      return 'weak-password';
    case 'same_password':
      return 'same-password';
    case 'email_address_invalid':
    case 'validation_failed':
      return 'invalid-email';
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
    case 'over_sms_send_rate_limit':
      return 'rate-limited';
    case 'otp_expired':
    case 'flow_state_expired':
    case 'bad_code_verifier':
      return 'expired-link';
    case 'session_not_found':
    case 'refresh_token_not_found':
    case 'no_authorization':
      return 'no-session';
    default:
      return undefined;
  }
}

/**
 * Maps a failure to a code by inspecting its message.
 *
 * Only reached when the provider gave no code. Kept narrow — an over-eager
 * match here would mislabel a failure and show the user the wrong remedy, which
 * is worse than showing the generic one.
 */
function codeFromMessage(message: string): AuthErrorCode | undefined {
  const text = message.toLowerCase();

  if (text.includes('failed to fetch') || text.includes('network')) return 'network';
  if (text.includes('email not confirmed') || text.includes('not confirmed')) {
    return 'email-not-confirmed';
  }
  if (text.includes('invalid login credentials')) return 'invalid-credentials';
  if (text.includes('password should be at least')) return 'weak-password';
  if (text.includes('rate limit') || text.includes('too many requests')) return 'rate-limited';
  if (text.includes('expired') || text.includes('invalid or has expired')) return 'expired-link';

  return undefined;
}

/**
 * Extracts the provider's error code, which has moved between fields across
 * releases. `code` is current; `error_code` appears in older payloads and on
 * the `AuthApiError` shape returned by some endpoints.
 */
function providerCode(error: object): string | undefined {
  const candidate = error as { code?: unknown; error_code?: unknown };

  if (typeof candidate.code === 'string') return candidate.code;
  if (typeof candidate.error_code === 'string') return candidate.error_code;

  return undefined;
}

/**
 * Translates anything thrown or returned by the auth client into an `AuthError`.
 *
 * Accepts `unknown` because that is what a `catch` binds, and because the auth
 * client returns failures in more than one shape rather than throwing.
 */
export function toAuthError(cause: unknown): AuthError {
  if (cause instanceof AuthError) return cause;

  // A `TypeError` from `fetch` is how a genuine network fault arrives, and it
  // carries no provider code. Recognising it prevents the most common
  // connectivity failure from being reported as "something went wrong".
  if (cause instanceof TypeError) {
    return new AuthError('network', MESSAGES.network, { cause });
  }

  if (typeof cause === 'object' && cause !== null) {
    const { message } = cause as { message?: unknown };
    const text = typeof message === 'string' ? message : '';

    const declared = providerCode(cause);
    const code =
      (declared === undefined ? undefined : codeFromProviderCode(declared)) ??
      (text === '' ? undefined : codeFromMessage(text)) ??
      'unknown';

    // The provider's own text is kept as the cause for logs, but is never
    // rendered: it is unstable prose and can name internal detail. Our message
    // for the code is what the user sees.
    return new AuthError(code, MESSAGES[code], { cause });
  }

  return new AuthError('unknown', MESSAGES.unknown, { cause });
}

/**
 * Whether the failure is worth retrying unchanged.
 *
 * A rate limit or a dropped connection may succeed on a second attempt; a wrong
 * password will not, and offering a retry there just invites a lockout.
 */
export function isRetryable(error: AuthError): boolean {
  return error.code === 'network' || error.code === 'rate-limited';
}

/**
 * Whether the user can fix the failure by requesting a new email.
 */
export function canResendEmail(error: AuthError): boolean {
  return error.code === 'email-not-confirmed' || error.code === 'expired-link';
}

/**
 * Reads a failure that the provider reported in the URL instead of in a response.
 *
 * This is a different shape of failure from everything above, and it is the one
 * most easily missed. When a user follows a confirmation or recovery link that
 * has expired or already been used, the provider does not fail an API call —
 * there is no call. It redirects to our own page with the problem in the URL
 * fragment, and the client library then finds no session to establish.
 *
 * The visible result, if this is not handled, is a page sitting in its loading
 * state forever, or a form that rejects a password update with no explanation.
 * Neither tells the user the link is stale, which is the one thing they need to
 * know and can act on.
 *
 * Takes the URL as a string rather than reading `window`, so it can be tested
 * against the exact fragments the provider produces.
 *
 * Both the query string and the fragment are inspected. Password and magic-link
 * flows deliver their tokens in the fragment, while OAuth-style error
 * redirects use the query string; checking only one would miss half the cases.
 */
export function authErrorFromUrl(url: string): AuthError | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }

  const params = new URLSearchParams(parsed.search);
  for (const [key, value] of new URLSearchParams(parsed.hash.replace(/^#/, ''))) {
    params.set(key, value);
  }

  const code = params.get('error_code') ?? params.get('error');
  if (code === null || code === '') return undefined;

  // `access_denied` is what an expired or reused link looks like from here, and
  // it is the overwhelmingly common case. Mapping it to `expired-link` lets the
  // page offer the remedy that actually works — request another one — instead of
  // a generic apology with no next step.
  const mapped: AuthErrorCode =
    code === 'access_denied' || code === 'otp_expired' ? 'expired-link' : 'unknown';

  return new AuthError(mapped, MESSAGES[mapped]);
}
