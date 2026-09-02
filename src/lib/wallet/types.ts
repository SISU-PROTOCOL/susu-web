/**
 * Wallet abstraction.
 *
 * Everything in this app that needs a signature goes through this interface, so
 * that adding a wallet is an adapter rather than a change to feature code, and
 * so that the rules that keep the app non-custodial live in one place:
 *
 *   - The app never sees a private key, a seed phrase, or a signed blob it did
 *     not construct.
 *   - The signing network passphrase is supplied by the caller, derived from
 *     validated configuration, never chosen by the wallet.
 *   - A returned signature is only a candidate. It is still unconfirmed until
 *     the chain says otherwise (see `lib/stellar/result.ts`).
 */

export type WalletId = 'freighter';

/** An authorized account. */
export interface WalletAccount {
  readonly address: string;
}

export interface SignTransactionOptions {
  /** The passphrase of the network the transaction was built for. */
  readonly networkPassphrase: string;
  /**
   * The account expected to sign. When supplied, a signature from any other
   * account is rejected rather than used.
   */
  readonly address?: string;
}

/** A signed envelope and the account that produced it. */
export interface SignedTransaction {
  readonly signedTxXdr: string;
  readonly signerAddress: string;
}

export interface SignMessageOptions {
  /** The passphrase of the network the signature is bound to. */
  readonly networkPassphrase: string;
  /** The account expected to sign; a signature from another is rejected. */
  readonly address?: string;
}

/** A signature over arbitrary text, base64, and the account that produced it. */
export interface SignedMessage {
  readonly signature: string;
  readonly signerAddress: string;
}

export interface WalletAdapter {
  readonly id: WalletId;
  readonly name: string;

  /** Whether the extension is present and reachable. Never prompts. */
  isAvailable(): Promise<boolean>;

  /**
   * Requests access to an account. May prompt the user, so call it from a user
   * gesture and never on page load.
   */
  connect(): Promise<WalletAccount>;

  /**
   * Returns the account already authorized for this site, or `null`. Never
   * prompts, so it is safe to call during initialization.
   */
  getConnectedAccount(): Promise<WalletAccount | null>;

  /**
   * Asks the wallet to sign an envelope. Returns the signed XDR; it does not
   * submit anything, and a result here is not proof that anything happened.
   */
  signTransaction(xdr: string, options: SignTransactionOptions): Promise<SignedTransaction>;

  /**
   * Signs arbitrary text, which is how a wallet proves it is yours.
   *
   * SEP-53, the scheme Stellar wallets implement for "sign this message". The
   * text is never chosen by the caller that displays it: the API sends the exact
   * string to sign, and this passes it through unchanged, because a signature
   * over text the signer composed proves nothing about the request it came with.
   *
   * No funds move and nothing is submitted. It is a proof of key control, and the
   * only thing it is used for here is binding an address to an account.
   */
  signMessage(message: string, options: SignMessageOptions): Promise<SignedMessage>;
}
