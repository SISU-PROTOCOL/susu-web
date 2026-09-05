import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentType } from 'react';
import type { AuthContextValue } from '@/lib/auth/context';

/**
 * A smoke test for the front page.
 *
 * `/` is the one page every visitor reaches first, and it is also the page with
 * the least behind it: no session, no wallet, no API. That makes it easy to break
 * without noticing, because nothing else in the app exercises it and no other
 * test renders it. A crash here is also the most expensive one — it is the page
 * that has to work for someone who has never heard of this project.
 *
 * Rendered with `react-dom/server` rather than a browser environment, which
 * keeps the test honest about what it checks: that the component renders, that
 * its branching on session state does not throw, and that what it claims about
 * the network comes from configuration rather than from a hard-coded string. It
 * deliberately does not assert on layout or styling, which a string-rendering
 * test cannot see and would only pretend to.
 *
 * WHY THE COMPONENT IS IMPORTED INSIDE EACH TEST
 * `getEnv()` parses the environment once and caches it module-side, so a
 * top-level `import` would freeze the configuration at whatever the first test
 * set — and the network assertion below would then pass whether or not the
 * component read configuration at all. Clearing the module registry and
 * re-importing forces a fresh parse, which is what makes that assertion capable
 * of failing.
 */

const ENV = {
  VITE_APP_URL: 'http://localhost:5173',
  VITE_SUPABASE_URL: 'https://example.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'anon-key',
  VITE_STELLAR_NETWORK: 'testnet',
  VITE_STELLAR_RPC_URL: 'https://soroban-testnet.stellar.org',
  VITE_FACTORY_CONTRACT_ID: `C${'A'.repeat(55)}`,
  VITE_USDC_CONTRACT_ID: `C${'B'.repeat(55)}`,
  VITE_EXPLORER_BASE_URL: 'https://stellar.expert/explorer/testnet',
} as const;

function context(status: AuthContextValue['status']): AuthContextValue {
  return {
    status,
    user: undefined,
    signOut: () => Promise.resolve(),
    refresh: () => Promise.resolve(),
  };
}

async function render(
  status: AuthContextValue['status'],
  env: Record<string, string> = ENV as unknown as Record<string, string>,
): Promise<string> {
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  vi.resetModules();

  // Both imported after the reset, so the component and the context it reads come
  // from the same module generation. Importing `AuthContext` at the top of the
  // file instead would give this test a provider from the previous generation —
  // a different object as far as React is concerned — and `useAuth` would throw
  // for the right reason and the wrong cause.
  const { AuthContext } = await import('@/lib/auth/context');
  const { Landing } = (await import('./Landing')) as { Landing: ComponentType };

  const html = renderToString(
    <AuthContext.Provider value={context(status)}>
      <MemoryRouter>
        <Landing />
      </MemoryRouter>
    </AuthContext.Provider>,
  );

  // React separates adjacent text nodes with comment markers — `Stellar<!--
  // -->testnet` — so a substring taken from the source is not a substring of the
  // markup. Stripping them yields the text a reader actually sees, which is what
  // these assertions are about.
  return html.replace(/<!--.*?-->/g, '');
}

describe('the landing page', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('renders for a visitor with no session', async () => {
    const html = await render('anonymous');

    expect(html).toContain('Save together. Without the trust issues.');
    // The call to action must be the one that applies to this visitor.
    expect(html).toContain('Create an account');
    expect(html).toContain('href="/signup"');
  });

  it('points a signed-in visitor at the app instead of the signup form', async () => {
    const html = await render('authenticated');

    expect(html).toContain('href="/app"');
    expect(html).not.toContain('href="/signup"');
  });

  it('warns that a testnet deployment must not be given real funds', async () => {
    const html = await render('anonymous');

    expect(html).toContain('Stellar testnet');
    expect(html).toContain('do not use real funds');
  });

  it('drops the warning on mainnet, because the network comes from configuration', async () => {
    // The counterpart to the assertion above, and the reason this test is worth
    // having: without it, a component that hard-coded "testnet" would pass.
    const html = await render('anonymous', {
      ...ENV,
      VITE_STELLAR_NETWORK: 'mainnet',
      VITE_STELLAR_RPC_URL: 'https://soroban-mainnet.stellar.org',
    });

    expect(html).not.toContain('do not use real funds');
    expect(html).toContain('Save together. Without the trust issues.');
  });

  it('states the fee as a ceiling, because that is what the contract enforces', async () => {
    const html = await render('anonymous');

    expect(html).toContain('at most 0.50%');
  });
});
