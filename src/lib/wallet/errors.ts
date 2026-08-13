/** Why a wallet operation could not be completed. */
export type WalletErrorCode =
  /** The extension is not installed, or not reachable from this page. */
  | 'unavailable'
  /** No account has been authorized for this site yet. */
  | 'not-connected'
  /** The user declined, or closed the prompt without deciding. */
  | 'rejected'
  /** The wallet replied, but the reply was not usable. */
  | 'malformed-response'
  /** The wallet signed with a different account than the one requested. */
  | 'account-mismatch';

/**
 * A wallet operation failed.
 *
 * Callers should branch on `code`. Note in particular that `rejected` is a
 * user decision rather than a fault, and must not be surfaced as an error state.
 */
export class WalletError extends Error {
  readonly code: WalletErrorCode;

  constructor(code: WalletErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'WalletError';
    this.code = code;
  }
}
