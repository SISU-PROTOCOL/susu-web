import { describe, expect, it } from 'vitest';
import { findCredentialMaterial } from './check-bundle-credentials.mjs';

/**
 * These pin the scanner's own behaviour, because it is a security control and
 * the thing it guards against is a leak that is invisible until it is exploited.
 *
 * The first case is the important one: it is a real false positive that broke a
 * build. `@supabase/supabase-js` contains a `startsWith('sb_secret_')` check of
 * its own, so the moment the client became reachable from the entry point the
 * bare prefix entered the bundle and a prefix-only scan failed on library code.
 * The previous, name-based version of this check hit the same class of problem.
 */

// Assembled from parts so this file does not itself contain a credential-shaped
// literal for a secret scanner to flag — the same reason the scanner does it.
const SECRET_KEY_PREFIX = 'sb' + '_' + 'secret' + '_';
const ACCESS_TOKEN_PREFIX = 'sbp' + '_';
const PUBLISHABLE_PREFIX = 'sb' + '_' + 'publishable' + '_';
const BODY = 'A'.repeat(40);

function base64url(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

describe('findCredentialMaterial — secret keys', () => {
  it('does not flag a bare prefix, which is all library code contains', () => {
    // The exact string supabase-js minifies to. Failing here means every build
    // fails for as long as that library is in the bundle.
    expect(findCredentialMaterial('e.startsWith(`' + SECRET_KEY_PREFIX + '`)')).toEqual([]);
  });

  it('flags a prefix followed by a key-length body', () => {
    const findings = findCredentialMaterial(SECRET_KEY_PREFIX + BODY);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain('secret key');
  });

  it('flags an access token', () => {
    const findings = findCredentialMaterial(ACCESS_TOKEN_PREFIX + BODY);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain('access token');
  });

  it('does not flag the publishable prefix, which is meant to be public', () => {
    expect(findCredentialMaterial(PUBLISHABLE_PREFIX + BODY)).toEqual([]);
  });

  it('does not flag a prefix whose body is too short to be a key', () => {
    // Documents the floor. A body this short is a constant or a substring, not a
    // value anyone generated.
    expect(findCredentialMaterial(SECRET_KEY_PREFIX + 'abc')).toEqual([]);
  });

  it('never echoes the secret body into the finding', () => {
    // Findings are printed in a public build log, so only the prefix — which is
    // not the secret part — may appear.
    const findings = findCredentialMaterial(SECRET_KEY_PREFIX + BODY);
    expect(findings[0]).not.toContain(BODY);
  });
});

describe('findCredentialMaterial — service-role tokens', () => {
  it('flags a JWT whose payload claims service_role', () => {
    const token = [
      base64url({ alg: 'HS256' }),
      base64url({ role: 'service_role' }),
      'x'.repeat(20),
    ].join('.');

    const findings = findCredentialMaterial(token);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain('service_role');
  });

  it('does not flag a JWT that claims anon', () => {
    // The publishable/anon key is a JWT of exactly this shape. Flagging it would
    // make the check impossible to satisfy.
    const token = [base64url({ alg: 'HS256' }), base64url({ role: 'anon' }), 'x'.repeat(20)].join(
      '.',
    );

    expect(findCredentialMaterial(token)).toEqual([]);
  });

  it('does not flag an ordinary dotted string', () => {
    expect(findCredentialMaterial('a.b.c')).toEqual([]);
    expect(findCredentialMaterial('user.name@example.com')).toEqual([]);
  });
});

describe('findCredentialMaterial — database URLs', () => {
  it('flags a URL carrying a password', () => {
    const findings = findCredentialMaterial(
      'postgresql://postgres:hunter2@db.example.com:5432/postgres',
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain('database URL');
  });

  it('does not flag a URL without credentials', () => {
    expect(findCredentialMaterial('postgresql://db.example.com:5432/postgres')).toEqual([]);
  });
});

describe('findCredentialMaterial — a clean bundle', () => {
  it('finds nothing in ordinary application code', () => {
    const clean = `
      const url = import.meta.env.VITE_SUPABASE_URL;
      const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
      export function signIn(email, password) { return fetch(url, { body: { email, password } }); }
    `;

    expect(findCredentialMaterial(clean)).toEqual([]);
  });
});
