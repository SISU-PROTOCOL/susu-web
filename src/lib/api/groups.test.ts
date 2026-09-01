import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ENV = {
  VITE_APP_URL: 'http://localhost:5173',
  VITE_SUPABASE_URL: 'https://example.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'test-key',
  VITE_STELLAR_NETWORK: 'testnet',
  VITE_STELLAR_RPC_URL: 'https://soroban-testnet.stellar.org',
  VITE_FACTORY_CONTRACT_ID: '',
  VITE_USDC_CONTRACT_ID: '',
  VITE_EXPLORER_BASE_URL: 'https://stellar.expert/explorer/testnet',
  VITE_API_BASE_URL: 'https://api.example.test/api/v1',
};

vi.mock('../env', () => ({ getEnv: () => ENV }));

// The session `registerGroupQuietly` reads its token from. Held in a ref so the
// "nobody is signed in" path — the one that must not throw — can be exercised.
const sessionRef = vi.hoisted(() => ({
  current: { access_token: 'a-token' } as { access_token: string } | null,
}));
vi.mock('../supabase', () => ({
  getSupabaseClient: () => ({
    auth: { getSession: async () => ({ data: { session: sessionRef.current } }) },
  }),
}));

const {
  listGroups,
  getGroup,
  listActivity,
  getTransactionReceipt,
  looksLikeTransactionHash,
  registerGroup,
  registerGroupQuietly,
} = await import('./groups');

const GROUP = `C${'A'.repeat(55)}`;
const MEMBER = `G${'B'.repeat(55)}`;
const HASH = 'a'.repeat(64);

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  sessionRef.current = { access_token: 'a-token' };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function ok(data: unknown): Response {
  return new Response(JSON.stringify({ data }), { status: 200 });
}

function okPage(data: unknown, page: unknown): Response {
  return new Response(JSON.stringify({ data, page }), { status: 200 });
}

const SUMMARY = {
  contractId: GROUP,
  factoryContractId: `C${'C'.repeat(55)}`,
  groupId: 1,
  creator: MEMBER,
  token: `C${'D'.repeat(55)}`,
  contributionAmount: '10000000',
  memberCapacity: 3,
  createdLedger: 4651000,
  status: 'active',
  memberCount: 3,
  currentRound: 2,
  completedRounds: 1,
  contributedTotal: '30000000',
  paidOutTotal: '29850000',
  feeTotal: '150000',
  lastEventLedger: 4651300,
};

describe('listGroups', () => {
  it('requests the groups path with no query when unfiltered', async () => {
    fetchMock.mockResolvedValue(okPage([], { limit: 20, offset: 0, hasMore: false }));

    await listGroups();

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.example.test/api/v1/groups');
  });

  it('filters by member so one account’s groups can be asked for', async () => {
    fetchMock.mockResolvedValue(okPage([SUMMARY], { limit: 20, offset: 0, hasMore: false }));

    const page = await listGroups({ member: MEMBER });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `https://api.example.test/api/v1/groups?member=${MEMBER}`,
    );
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.contractId).toBe(GROUP);
  });

  it('carries the page position through', async () => {
    fetchMock.mockResolvedValue(okPage([SUMMARY], { limit: 5, offset: 10, hasMore: true }));

    const page = await listGroups({ limit: 5, offset: 10 });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://api.example.test/api/v1/groups?limit=5&offset=10',
    );
    expect(page).toMatchObject({ limit: 5, offset: 10, hasMore: true });
  });

  it('omits absent filters rather than serialising them', async () => {
    fetchMock.mockResolvedValue(okPage([], { limit: 20, offset: 0, hasMore: false }));

    // `?member=undefined` would fail the API's address pattern and report "no
    // filter" as a 400.
    await listGroups({ status: 'open' });

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.example.test/api/v1/groups?status=open');
  });

  it('keeps amounts as strings so base units survive', async () => {
    fetchMock.mockResolvedValue(okPage([SUMMARY], { limit: 20, offset: 0, hasMore: false }));

    const page = await listGroups();

    // Ten million base units is one USDC at seven decimals. As a number this
    // would be exact and still wrong to do: the same expression at 2^53 is
    // silently lossy, and no caller can tell the two cases apart.
    expect(page.items[0]?.contributionAmount).toBe('10000000');
  });

  it('surfaces the API’s refusal', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'bad_request' }), { status: 400 }),
    );

    await expect(listGroups({ member: 'nope' })).rejects.toMatchObject({ status: 400 });
  });
});

describe('getGroup', () => {
  it('reads one group by address', async () => {
    fetchMock.mockResolvedValue(
      ok({
        ...SUMMARY,
        members: [{ member: MEMBER, position: 1, joinedLedger: 4651100 }],
        rounds: [],
      }),
    );

    const group = await getGroup(GROUP);

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`https://api.example.test/api/v1/groups/${GROUP}`);
    expect(group.members).toHaveLength(1);
    expect(group.currentRound).toBe(2);
  });

  it('reports an unknown group as a 404 with its code', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'group_not_found' }), { status: 404 }),
    );

    await expect(getGroup(GROUP)).rejects.toMatchObject({
      status: 404,
      code: 'group_not_found',
    });
  });

  it('encodes the address in the path', async () => {
    fetchMock.mockResolvedValue(ok({ ...SUMMARY, members: [], rounds: [] }));

    await getGroup('C+weird/address');

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://api.example.test/api/v1/groups/C%2Bweird%2Faddress',
    );
  });
});

describe('listActivity', () => {
  it('reads the event feed for a group', async () => {
    fetchMock.mockResolvedValue(
      okPage([{ name: 'contribution', ledger: 4651300 }], {
        limit: 20,
        offset: 0,
        hasMore: false,
      }),
    );

    const page = await listActivity(GROUP);

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `https://api.example.test/api/v1/groups/${GROUP}/activity`,
    );
    expect(page.items[0]?.name).toBe('contribution');
  });
});

describe('getTransactionReceipt', () => {
  it('reads the receipt for a transaction hash', async () => {
    fetchMock.mockResolvedValue(
      ok({
        txHash: HASH,
        ledger: 4651300,
        txIndex: 0,
        events: [
          {
            eventIdentity: `${HASH}:0`,
            name: 'contribution',
            contractId: GROUP,
            eventIndex: 0,
            payload: {},
          },
        ],
      }),
    );

    const receipt = await getTransactionReceipt(HASH);

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `https://api.example.test/api/v1/transactions/${HASH}`,
    );
    expect(receipt.ledger).toBe(4651300);
    expect(receipt.events[0]?.name).toBe('contribution');
  });

  it('reports a transaction the index has not reached as a 404', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'transaction_not_found' }), { status: 404 }),
    );

    // The caller has to treat this as possibly-temporary; the transport's job is
    // only to report it faithfully.
    await expect(getTransactionReceipt(HASH)).rejects.toMatchObject({ status: 404 });
  });
});

describe('looksLikeTransactionHash', () => {
  it('accepts a hash in either case', () => {
    expect(looksLikeTransactionHash(HASH)).toBe(true);
    expect(looksLikeTransactionHash(HASH.toUpperCase())).toBe(true);
  });

  it('rejects anything that is not 32 bytes of hex', () => {
    expect(looksLikeTransactionHash('')).toBe(false);
    expect(looksLikeTransactionHash(HASH.slice(0, 63))).toBe(false);
    expect(looksLikeTransactionHash(HASH.slice(0, 63) + 'z')).toBe(false);
    expect(looksLikeTransactionHash(GROUP)).toBe(false);
  });
});

describe('registerGroup', () => {
  it('posts the address with the caller’s token', async () => {
    fetchMock.mockResolvedValue(ok({ contractId: GROUP, expiresAt: '2026-01-01T00:30:00.000Z' }));

    const registered = await registerGroup(GROUP, 'a-token');

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.example.test/api/v1/groups');
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ contractId: GROUP });
    expect(registered.expiresAt).toBe('2026-01-01T00:30:00.000Z');
  });
});

describe('registerGroupQuietly', () => {
  it('reports success when the API records the claim', async () => {
    fetchMock.mockResolvedValue(ok({ contractId: GROUP, expiresAt: '2026-01-01T00:30:00.000Z' }));

    await expect(registerGroupQuietly(GROUP)).resolves.toBe(true);
  });

  it('reports failure without a request when nobody is signed in', async () => {
    sessionRef.current = null;

    await expect(registerGroupQuietly(GROUP)).resolves.toBe(false);
    // No token, so there is no call to make. Sending one would be a 401 and a
    // wasted round trip on a path that already has a fallback.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports failure rather than throwing when the API refuses', async () => {
    // The account is holding its live registrations, or the API is down. Either
    // way the group exists on chain, so a caller must not see an error.
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'too_many_registrations' }), { status: 409 }),
    );

    await expect(registerGroupQuietly(GROUP)).resolves.toBe(false);
  });

  it('reports failure rather than throwing when the network is unreachable', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(registerGroupQuietly(GROUP)).resolves.toBe(false);
  });
});
