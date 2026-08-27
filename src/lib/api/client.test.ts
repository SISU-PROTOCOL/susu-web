import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRequest } from './client';
import { ApiError, apiErrorMessage, isRetryableApiError } from './errors';

/**
 * The HTTP client.
 *
 * `fetch` is stubbed rather than pointed at a server, so the cases worth testing
 * are reachable: a 502 from a proxy that returns HTML, a 204 with no body, a 2xx
 * that is not the documented envelope, and a request that never arrives. Those
 * are the paths a happy-path integration test never sees.
 */

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

vi.mock('../env', () => ({
  getEnv: () => ENV,
}));

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiRequest', () => {
  it('unwraps the data envelope', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { data: { code: 'abc' } }));

    const result = await apiRequest<{ code: string }>('invites');

    expect(result).toEqual({ code: 'abc' });
  });

  it('builds the URL from the base and path without doubling the slash', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { data: null }));

    await apiRequest('/invites/redeem');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/invites/redeem',
      expect.anything(),
    );
  });

  it('sends the token as a bearer header', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { data: null }));

    await apiRequest('me', { token: 'a-session-token' });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)['authorization']).toBe(
      'Bearer a-session-token',
    );
  });

  it('sends no authorization header without a token', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { data: null }));

    await apiRequest('groups');

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)['authorization']).toBeUndefined();
  });

  it('serialises a body and declares it JSON', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { data: null }));

    await apiRequest('invites/redeem', { method: 'POST', body: { code: 'abc' } });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.body).toBe('{"code":"abc"}');
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json');
  });

  it('resolves with nothing for a 204', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    // A 204 has no body by definition; requiring an envelope would fail on the
    // one response shape that cannot have one.
    await expect(apiRequest('notifications/x/read', { method: 'POST' })).resolves.toBeUndefined();
  });

  it('reports the API’s error code', async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, { error: 'invite_not_found' }));

    await expect(apiRequest('invites/redeem', { method: 'POST', body: {} })).rejects.toMatchObject({
      name: 'ApiError',
      status: 404,
      code: 'invite_not_found',
    });
  });

  it('reports a non-JSON failure by its status', async () => {
    // A 502 from a proxy is HTML, and parsing it would throw a SyntaxError that
    // says nothing about what happened.
    fetchMock.mockResolvedValue(
      new Response('<html>bad gateway</html>', {
        status: 502,
        headers: { 'content-type': 'text/html' },
      }),
    );

    await expect(apiRequest('groups')).rejects.toMatchObject({ status: 502, code: undefined });
  });

  it('reports a request that never arrived as status 0', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(apiRequest('groups')).rejects.toMatchObject({ status: 0 });
  });

  it('re-throws an abort unchanged', async () => {
    const abort = new DOMException('aborted', 'AbortError');
    fetchMock.mockRejectedValue(abort);

    // A cancellation is not a failure, and React Query needs to recognise it as
    // one to avoid reporting an error to the user.
    await expect(apiRequest('groups')).rejects.toBe(abort);
  });

  it('refuses a 2xx that is not the documented envelope', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { unexpected: true }));

    // Returning `undefined` here would make a contract mismatch look like a
    // successful call that produced nothing.
    await expect(apiRequest('groups')).rejects.toBeInstanceOf(ApiError);
  });
});

describe('apiErrorMessage', () => {
  it('explains an unknown code without quoting the code', () => {
    const message = apiErrorMessage(new ApiError(404, 'invite_not_found', 'raw'));

    expect(message).toBe('This invite link is not valid any more.');
    expect(message).not.toContain('invite_not_found');
  });

  it('falls back for a code it does not know', () => {
    expect(apiErrorMessage(new ApiError(400, 'something_new', 'raw'))).toBe(
      'Something went wrong. Try again.',
    );
  });

  it('distinguishes an unreachable server from a refusal', () => {
    expect(apiErrorMessage(new ApiError(0, undefined, 'raw'))).toContain('reach the server');
  });

  it('passes through a plain Error’s message', () => {
    expect(apiErrorMessage(new Error('Connect a wallet first.'))).toBe('Connect a wallet first.');
  });

  it('says something for a non-Error', () => {
    expect(apiErrorMessage('a string')).toBe('Something went wrong. Try again.');
  });
});

describe('isRetryableApiError', () => {
  it('retries a server fault, a rate limit, and an unreachable server', () => {
    expect(isRetryableApiError(new ApiError(500, undefined, 'x'))).toBe(true);
    expect(isRetryableApiError(new ApiError(503, undefined, 'x'))).toBe(true);
    expect(isRetryableApiError(new ApiError(429, undefined, 'x'))).toBe(true);
    expect(isRetryableApiError(new ApiError(0, undefined, 'x'))).toBe(true);
  });

  it('does not retry a considered refusal', () => {
    // Repeating a 4xx unchanged produces the same answer.
    expect(isRetryableApiError(new ApiError(400, undefined, 'x'))).toBe(false);
    expect(isRetryableApiError(new ApiError(404, undefined, 'x'))).toBe(false);
    expect(isRetryableApiError(new ApiError(409, undefined, 'x'))).toBe(false);
    expect(isRetryableApiError(new ApiError(401, undefined, 'x'))).toBe(false);
  });

  it('does not treat a cancellation as retryable', () => {
    expect(isRetryableApiError(new DOMException('aborted', 'AbortError'))).toBe(false);
  });
});
