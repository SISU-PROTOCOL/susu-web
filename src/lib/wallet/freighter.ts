import {
  getAddress,
  isAllowed,
  isConnected,
  requestAccess,
  signTransaction as freighterSignTransaction,
} from '@stellar/freighter-api';
import { WalletError, type WalletErrorCode } from './errors';
import type {
  SignedTransaction,
  SignTransactionOptions,
  WalletAccount,
  WalletAdapter,
} from './types';

/**
 * Freighter adapter (MVP wallet).
 *
 * Freighter's API does not throw. Every call resolves to an object carrying an
 * optional `error`, and on failure the value fields are left as empty strings —
 * `signTransaction` on failure resolves to `{ signedTxXdr: '', signerAddress: '',
 * error }`. Treating that as a value rather than a fault is the single easiest
 * way to misuse this library, so every call goes through `unwrap` below, which
 * turns an errored response into a thrown `WalletError`.
 *
 * The declared `error` field is typed against an internal alias that is not
 * resolvable from outside the package (`@shared/api/types`), and in practice it
 * can be a bare string. Responses are therefore narrowed structurally to
 * `ErrorBearing` rather than relying on that type.
 */

interface ErrorBearing {
  readonly error?: unknown;
}

/** True when a response carries an error. */
function hasError(response: ErrorBearing): boolean {
  return response.error !== undefined;
}

function errorText(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error !== null && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    for (const key of ['message', 'error', 'code', 'name']) {
      const value = record[key];
      if (typeof value === 'string' && value !== '') return value;
    }
  }
  return '';
}

/**
 * Maps a Freighter error onto one of our codes.
 *
 * Freighter does not expose stable error codes, so this matches on the message
 * text. The important distinction is a user declining a prompt, which is a
 * decision rather than a fault and must not be rendered as an error state.
 */
export function classifyFreighterError(error: unknown): WalletErrorCode {
  const text = errorText(error).toLowerCase();

  if (/declin|reject|denied|cancel|user (did not|denied)/.test(text)) return 'rejected';
  if (/browser|extension|not available|not installed|node/.test(text)) return 'unavailable';

  return 'malformed-response';
}

function unwrap<T extends ErrorBearing>(response: T, context: string): T {
  if (hasError(response)) {
    const code = classifyFreighterError(response.error);
    const detail = errorText(response.error);
    throw new WalletError(code, `${context} failed${detail === '' ? '' : `: ${detail}`}`, {
      cause: response.error,
    });
  }
  return response;
}

export const freighterWallet: WalletAdapter = {
  id: 'freighter',
  name: 'Freighter',

  async isAvailable(): Promise<boolean> {
    try {
      const response = unwrap(
        (await isConnected()) as unknown as { isConnected: boolean } & ErrorBearing,
        'Freighter availability check',
      );
      return response.isConnected;
    } catch {
      // A missing extension is not an exceptional condition: it is simply one of
      // the wallets this app does not have available.
      return false;
    }
  },

  async connect(): Promise<WalletAccount> {
    const response = unwrap(
      (await requestAccess()) as unknown as { address: string } & ErrorBearing,
      'Freighter connection',
    );

    if (response.address === '') {
      throw new WalletError('malformed-response', 'Freighter returned no account address.');
    }

    return { address: response.address };
  },

  async getConnectedAccount(): Promise<WalletAccount | null> {
    let allowed;
    try {
      allowed = unwrap(
        (await isAllowed()) as unknown as { isAllowed: boolean } & ErrorBearing,
        'Freighter permission check',
      );
    } catch {
      return null;
    }

    if (!allowed.isAllowed) return null;

    let response;
    try {
      response = unwrap(
        (await getAddress()) as unknown as { address: string } & ErrorBearing,
        'Freighter address lookup',
      );
    } catch {
      return null;
    }

    return response.address === '' ? null : { address: response.address };
  },

  async signTransaction(xdr: string, options: SignTransactionOptions): Promise<SignedTransaction> {
    const request: { networkPassphrase: string; address?: string } = {
      networkPassphrase: options.networkPassphrase,
    };
    if (options.address !== undefined) request.address = options.address;

    const response = unwrap(
      (await freighterSignTransaction(xdr, request)) as unknown as {
        signedTxXdr: string;
        signerAddress: string;
      } & ErrorBearing,
      'Freighter signing',
    );

    if (response.signedTxXdr === '') {
      throw new WalletError(
        'malformed-response',
        'Freighter returned an empty signed transaction.',
      );
    }

    // A wallet that echoes the envelope back unsigned would look like a success
    // to anything that only checked for a non-empty string.
    if (response.signedTxXdr === xdr) {
      throw new WalletError(
        'malformed-response',
        'Freighter returned the transaction unchanged; it does not appear to be signed.',
      );
    }

    if (options.address !== undefined && response.signerAddress !== options.address) {
      throw new WalletError(
        'account-mismatch',
        'The wallet signed with a different account than the one requested. ' +
          'This usually means the active account was switched. Nothing was submitted.',
      );
    }

    return { signedTxXdr: response.signedTxXdr, signerAddress: response.signerAddress };
  },
};
