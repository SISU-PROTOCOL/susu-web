import { describe, expect, it } from 'vitest';
import { safeRedirect } from './redirect';

describe('safeRedirect', () => {
  it('accepts a site-relative path', () => {
    expect(safeRedirect('/app')).toBe('/app');
    expect(safeRedirect('/app/groups?status=active')).toBe('/app/groups?status=active');
  });

  it('rejects an absolute URL, which would make login an open redirect', () => {
    // The attack this exists for. `RequireAuth` passes the intended destination
    // through navigation state, which is client-side input with no integrity; a
    // crafted link that put an attacker's address there would send the user to
    // it *after* they had signed in successfully, from a page whose address bar
    // was genuinely ours.
    expect(safeRedirect('https://evil.example/steal')).toBe('/app');
    expect(safeRedirect('http://evil.example')).toBe('/app');
    expect(safeRedirect('javascript:alert(1)')).toBe('/app');
  });

  it('rejects the protocol-relative forms explicitly', () => {
    // A leading-slash check alone is not sufficient: a browser reads
    // `//evil.example` as a host, and some intermediaries normalise `/\evil.example`
    // to the same thing.
    expect(safeRedirect('//evil.example')).toBe('/app');
    expect(safeRedirect('/\\evil.example')).toBe('/app');
  });

  it('rejects anything that is not a string', () => {
    // The value comes from navigation state, so its type is not guaranteed.
    // `undefined` is the ordinary case: a user who navigated to /login directly.
    expect(safeRedirect(undefined)).toBe('/app');
    expect(safeRedirect(null)).toBe('/app');
    expect(safeRedirect(42)).toBe('/app');
    expect(safeRedirect({ to: '/app' })).toBe('/app');
  });

  it('uses the supplied fallback', () => {
    expect(safeRedirect(undefined, '/')).toBe('/');
    expect(safeRedirect('https://evil.example', '/')).toBe('/');
  });

  it('rejects a relative path that is not site-absolute', () => {
    // `app/groups` is not a path from the site root, and navigating to it would
    // resolve against the current URL instead.
    expect(safeRedirect('app/groups')).toBe('/app');
    expect(safeRedirect('')).toBe('/app');
  });
});
