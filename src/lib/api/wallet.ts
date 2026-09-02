/**
 * Linking a wallet to an account.
 *
 * THE CLAIM, AND WHAT PROVES IT
 * Linking says "this Stellar account is mine". Without a proof that would be
 * "tell us any address you like", and the address column would be a free-text
 * field the rest of the system treats as an identity. So the API issues a nonce,
 * the wallet signs a message the API constructed, and the API verifies the
 * signature against the public key the address itself names.
 *
 * The signing happens in `lib/wallet`, through the adapter, so this module never
 * touches a wallet: it asks the API for something to sign, hands the text to a
 * caller-provided signing function, and returns the signature. That split is what
 * lets the flow be tested without a browser extension.
 *
 * WHAT THE SIGNATURE AUTHORISES
 * Nothing on chain. The message says so, and it names the account, the address,
 * the network and the nonce, so a signature cannot be replayed into a different
 * account, network or request. It is not a transaction and cannot move funds.
 */
import { apiRequest } from './client';

/** What the API hands back for a link attempt. */
export type WalletNonce = {
  /** Opaque; sent back with the signature. */
  readonly nonce: string;
  /** The exact text the wallet must sign, byte for byte. */
  readonly message: string;
  /** ISO 8601. After this the nonce is refused and a new one is needed. */
  readonly expiresAt: string;
};

/** The result of a successful link: the binding now on record. */
export type LinkedWallet = {
  readonly walletAddress: string;
};

/** Asks for something to sign, for one address. */
export async function requestWalletNonce(address: string, token: string): Promise<WalletNonce> {
  return apiRequest<WalletNonce>('wallet/nonce', {
    method: 'POST',
    token,
    body: { address },
  });
}

/**
 * Presents the signature, completing the link.
 *
 * The nonce is single-use: the API spends it before writing the binding, so a
 * retry after a network failure asks for a fresh nonce rather than reusing one.
 * That is why a failure here is handed back to the caller to retry from the
 * beginning rather than retried inside this function.
 */
export async function verifyWalletLink(
  input: { address: string; nonce: string; signature: string },
  token: string,
): Promise<LinkedWallet> {
  return apiRequest<LinkedWallet>('wallet/verify', {
    method: 'POST',
    token,
    body: { address: input.address, nonce: input.nonce, signature: input.signature },
  });
}
