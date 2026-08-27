/**
 * The HTTP client for `susu-api`.
 *
 * This is the only module in the app that talks to the backend, and it is
 * deliberately thin: build a URL, attach a token, parse a JSON body, and turn a
 * non-2xx response into an `ApiError`. Every decision about what a response
 * *means* belongs in the module that called it — invite codes mean nothing to a
 * generic transport.
 *
 * TOKENS ARE PASSED IN
 * The client never reads the session itself. A caller that needs authentication
 * supplies the token, which keeps this module free of Supabase and lets the tests
 * exercise every branch without a browser session or a network.
 *
 * WHAT IS DELIBERATELY ABSENT
 * No retry, and no timeout. Retrying is a policy that depends on the operation —
 * retrying a redeemed invite is safe, retrying anything that claims a use is not
 * something this layer can judge — and the callers that need it use React Query,
 * which owns that policy. A silent client-side timeout would also be a lie about
 * what happened to the request: the browser cancels its interest, not the
 * request, so the server may still have acted.
 */
import { getEnv } from '../env';
import { ApiError } from './errors';

/** The JSON envelope every successful response uses. */
type SuccessBody<T> = { data: T };

/** The envelope every failed response uses. */
type FailureBody = { error?: unknown };

export type RequestOptions = {
  readonly method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  /** Serialised as JSON. Omitted entirely when absent. */
  readonly body?: unknown;
  /** A Supabase access token, when the endpoint requires one. */
  readonly token?: string | undefined;
  /** Aborts the request. A cancelled request never resolves. */
  readonly signal?: AbortSignal | undefined;
};

function url(path: string): string {
  const base = getEnv().VITE_API_BASE_URL;
  if (base === undefined) {
    // Named explicitly rather than letting `undefined/groups` become a relative
    // request that the dev server answers with the SPA's index.html — which
    // `readJson` would then report as "an unexpected body", hiding the cause.
    throw new ApiError(0, undefined, 'VITE_API_BASE_URL is not configured.');
  }
  // Both halves are normalised, so a base URL with a trailing slash and a path
  // without a leading one do not produce a double slash. Some proxies treat `//`
  // as a protocol-relative reference, which is a real misconfiguration rather
  // than a cosmetic problem.
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

/**
 * Reads a response body as JSON, or `undefined` if it is not JSON.
 *
 * A 502 from a proxy is HTML, and `response.json()` on it throws a `SyntaxError`
 * that says nothing about the actual problem. Returning `undefined` lets the
 * caller report the status, which is the informative part.
 */
async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function codeOf(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const code = (body as FailureBody).error;
  return typeof code === 'string' ? code : undefined;
}

/**
 * Performs a request and returns the unwrapped `data`.
 *
 * Throws `ApiError` for anything other than a 2xx with a JSON body. A 204 has no
 * body by definition, so it resolves with `undefined` rather than failing to
 * parse.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (options.token !== undefined) headers['authorization'] = `Bearer ${options.token}`;

  let response: Response;
  try {
    response = await fetch(url(path), {
      method: options.method ?? 'GET',
      headers,
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
  } catch (error) {
    // A request that never arrived is a distinct failure from one the server
    // refused, and the difference matters to the user: one is worth retrying, the
    // other is not. An abort is not a failure and is re-thrown unchanged so
    // React Query handles it as a cancellation.
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(0, undefined, 'The request could not reach the server.');
  }

  const body = await readJson(response);

  if (!response.ok) {
    throw new ApiError(
      response.status,
      codeOf(body),
      `Request failed with status ${response.status}`,
    );
  }

  if (response.status === 204) return undefined as T;

  if (typeof body !== 'object' || body === null || !('data' in body)) {
    // A 2xx that is not the documented envelope means this client and the server
    // disagree about the contract, which is worth failing on rather than
    // returning `undefined` as though the call had succeeded.
    throw new ApiError(response.status, undefined, 'The server returned an unexpected body.');
  }

  return (body as SuccessBody<T>).data;
}
