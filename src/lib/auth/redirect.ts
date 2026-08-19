/**
 * Guards the destination a user is returned to after signing in.
 *
 * `RequireAuth` records where the user was trying to go and the login page sends
 * them back there. That value arrives through navigation state, which is a
 * client-side channel with no integrity: a crafted link, or any code able to
 * call `navigate` with state, can put an arbitrary string in it. Passing that
 * straight to the router turns the login page into an open redirect, and an open
 * redirect on a sign-in page is a phishing primitive — the address in the bar is
 * genuinely ours, and the user lands wherever the link chose.
 *
 * Only a site-relative path is therefore accepted. The protocol-relative forms
 * are rejected explicitly rather than left to chance: a browser reads `//evil.com`
 * as a host, and `/\/evil.com` is normalised to the same thing by some
 * intermediaries, so a check for a leading slash alone is not sufficient.
 */
export function safeRedirect(value: unknown, fallback = '/app'): string {
  if (typeof value !== 'string') return fallback;
  if (!value.startsWith('/')) return fallback;
  if (value.startsWith('//') || value.startsWith('/\\')) return fallback;

  return value;
}
