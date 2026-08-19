import { describe, expect, it } from 'vitest';
import { AuthError, authErrorFromUrl, canResendEmail, isRetryable, toAuthError } from './errors';

describe('toAuthError — translating provider failures', () => {
  it('maps the provider code, which is the stable identifier', () => {
    // The prose is not a contract; the code is. Every case below pairs a code
    // with a message chosen to be unhelpful, so a translation that fell back to
    // reading the text would be caught rather than passing by luck.
    const cases: readonly [string, string][] = [
      ['invalid_credentials', 'invalid-credentials'],
      ['email_not_confirmed', 'email-not-confirmed'],
      ['weak_password', 'weak-password'],
      ['same_password', 'same-password'],
      ['over_email_send_rate_limit', 'rate-limited'],
      ['over_request_rate_limit', 'rate-limited'],
      ['otp_expired', 'expired-link'],
      ['validation_failed', 'invalid-email'],
      ['session_not_found', 'no-session'],
    ];

    for (const [providerCode, expected] of cases) {
      const error = toAuthError({ code: providerCode, message: 'something else entirely' });
      expect(error.code, `provider code ${providerCode}`).toBe(expected);
    }
  });

  it('reads error_code, which older payloads use instead of code', () => {
    expect(toAuthError({ error_code: 'otp_expired', message: 'x' }).code).toBe('expired-link');
  });

  it('falls back to the message only when no code is present', () => {
    expect(toAuthError({ message: 'Invalid login credentials' }).code).toBe('invalid-credentials');
    expect(toAuthError({ message: 'Email not confirmed' }).code).toBe('email-not-confirmed');
    expect(toAuthError({ message: 'Password should be at least 6 characters' }).code).toBe(
      'weak-password',
    );
  });

  it('lets a provider code win over a misleading message', () => {
    // If both are present and disagree, the code is the one to trust. Getting
    // this backwards would show the wrong remedy — here, telling a user their
    // password is wrong when the real problem is an unconfirmed address.
    const error = toAuthError({
      code: 'email_not_confirmed',
      message: 'Invalid login credentials',
    });
    expect(error.code).toBe('email-not-confirmed');
  });

  it('recognises a network fault, which arrives as a TypeError with no code', () => {
    // The most common connectivity failure. Without this case it would be
    // reported as "something went wrong", giving the user nothing to act on.
    expect(toAuthError(new TypeError('Failed to fetch')).code).toBe('network');
  });

  it('reports an unrecognised failure as unknown rather than guessing', () => {
    expect(toAuthError({ message: 'a failure from a future release' }).code).toBe('unknown');
    expect(toAuthError('just a string').code).toBe('unknown');
    expect(toAuthError(undefined).code).toBe('unknown');
    expect(toAuthError(null).code).toBe('unknown');
  });

  it('passes an AuthError through unchanged', () => {
    const original = new AuthError('rate-limited', 'slow down');
    expect(toAuthError(original)).toBe(original);
  });
});

describe('toAuthError — what the user is shown', () => {
  it('never renders the provider text, which can name internal detail', () => {
    const providerText = 'Invalid login credentials';
    const error = toAuthError({ code: 'invalid_credentials', message: providerText });

    expect(error.message).not.toContain(providerText);
    // Still available to a developer, just not to the screen.
    expect((error.cause as { message: string }).message).toBe(providerText);
  });

  it('gives the same message for a wrong password and an unknown address', () => {
    // Account enumeration. Login is where a helpful message becomes an oracle:
    // "no such user" confirms which addresses are registered to anyone willing
    // to type them in. `invalid_credentials` is what the provider returns for
    // both cases, and this asserts we do not invent a distinction.
    const unknownAddress = toAuthError({ code: 'invalid_credentials', message: 'a' });
    const wrongPassword = toAuthError({ code: 'invalid_credentials', message: 'b' });

    expect(unknownAddress.message).toBe(wrongPassword.message);
  });
});

describe('isRetryable', () => {
  it('offers a retry only where one could succeed', () => {
    expect(isRetryable(new AuthError('network', ''))).toBe(true);
    expect(isRetryable(new AuthError('rate-limited', ''))).toBe(true);
  });

  it('does not offer a retry for a wrong password', () => {
    // Retrying unchanged cannot succeed, and encouraging it invites the rate
    // limit that follows a burst of attempts.
    expect(isRetryable(new AuthError('invalid-credentials', ''))).toBe(false);
    expect(isRetryable(new AuthError('expired-link', ''))).toBe(false);
  });
});

describe('canResendEmail', () => {
  it('is true only where another email would help', () => {
    expect(canResendEmail(new AuthError('email-not-confirmed', ''))).toBe(true);
    expect(canResendEmail(new AuthError('expired-link', ''))).toBe(true);
    expect(canResendEmail(new AuthError('invalid-credentials', ''))).toBe(false);
    expect(canResendEmail(new AuthError('weak-password', ''))).toBe(false);
  });
});

describe('authErrorFromUrl — failures reported in the URL', () => {
  it('reads an expired link from the fragment, which is how these arrive', () => {
    const error = authErrorFromUrl(
      'https://app.example/reset-password#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
    );
    expect(error?.code).toBe('expired-link');
  });

  it('reads the error when it is in the query string instead', () => {
    expect(authErrorFromUrl('https://app.example/reset-password?error=access_denied')?.code).toBe(
      'expired-link',
    );
  });

  it('maps an unrecognised code to unknown rather than expired', () => {
    expect(authErrorFromUrl('https://app.example/x#error=server_error')?.code).toBe('unknown');
  });

  it('reports nothing when there is no error in the URL', () => {
    // The ordinary case: a user who simply navigated to the page. Returning an
    // error here would tell everyone their link was broken.
    expect(authErrorFromUrl('https://app.example/reset-password')).toBeUndefined();
    expect(authErrorFromUrl('https://app.example/reset-password#')).toBeUndefined();
    expect(authErrorFromUrl('https://app.example/login?next=%2Fapp')).toBeUndefined();
  });

  it('reports nothing for an unparseable URL instead of throwing', () => {
    expect(authErrorFromUrl('not a url')).toBeUndefined();
    expect(authErrorFromUrl('')).toBeUndefined();
  });
});
