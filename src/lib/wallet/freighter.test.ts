import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('@stellar/freighter-api', () => ({
  getAddress: vi.fn(),
  isAllowed: vi.fn(),
  isConnected: vi.fn(),
  requestAccess: vi.fn(),
  signTransaction: vi.fn(),
}));

import {
  getAddress,
  isAllowed,
  isConnected,
  requestAccess,
  signTransaction,
} from '@stellar/freighter-api';
import { WalletError } from './errors';
import { classifyFreighterError, freighterWallet } from './freighter';

// The package types its responses against an internal alias that is not
// resolvable from outside it, so the mocks are used through plain Mock handles.
const askConnected = isConnected as unknown as Mock;
const askAccess = requestAccess as unknown as Mock;
const askAllowed = isAllowed as unknown as Mock;
const askAddress = getAddress as unknown as Mock;
const askSign = signTransaction as unknown as Mock;

const XDR = 'AAAA-envelope';
const ADDRESS = 'GBSUDM7EZ2EUID465JBLZ5II4HFY2GBMREPTB5BGIN4F7WOV3B3RGX2Y';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('classifyFreighterError', () => {
  it('recognises a declined prompt as a user decision', () => {
    expect(classifyFreighterError('User declined')).toBe('rejected');
    expect(classifyFreighterError({ message: 'The user rejected this request' })).toBe('rejected');
  });

  it('recognises a missing extension as unavailable', () => {
    expect(classifyFreighterError('Freighter is not installed')).toBe('unavailable');
    expect(classifyFreighterError({ message: 'not available in this browser' })).toBe(
      'unavailable',
    );
  });

  it('falls back to malformed-response', () => {
    expect(classifyFreighterError('something odd')).toBe('malformed-response');
    expect(classifyFreighterError(undefined)).toBe('malformed-response');
  });
});

describe('isAvailable', () => {
  it('is true when the extension reports a connection', async () => {
    askConnected.mockResolvedValue({ isConnected: true });
    await expect(freighterWallet.isAvailable()).resolves.toBe(true);
  });

  it('is false, rather than throwing, when the extension is absent', async () => {
    askConnected.mockResolvedValue({ isConnected: false, error: 'not available in this browser' });
    await expect(freighterWallet.isAvailable()).resolves.toBe(false);
  });
});

describe('connect', () => {
  it('returns the authorized account', async () => {
    askAccess.mockResolvedValue({ address: ADDRESS });
    await expect(freighterWallet.connect()).resolves.toEqual({ address: ADDRESS });
  });

  it('throws a rejected WalletError when the user declines', async () => {
    askAccess.mockResolvedValue({ address: '', error: 'User declined access' });
    await expect(freighterWallet.connect()).rejects.toMatchObject({
      name: 'WalletError',
      code: 'rejected',
    });
  });

  it('throws rather than returning an empty address', async () => {
    askAccess.mockResolvedValue({ address: '' });
    await expect(freighterWallet.connect()).rejects.toBeInstanceOf(WalletError);
  });
});

describe('getConnectedAccount', () => {
  it('returns null when the site is not yet allowed, without prompting', async () => {
    askAllowed.mockResolvedValue({ isAllowed: false });
    await expect(freighterWallet.getConnectedAccount()).resolves.toBeNull();
    expect(askAddress).not.toHaveBeenCalled();
  });

  it('returns the address when allowed', async () => {
    askAllowed.mockResolvedValue({ isAllowed: true });
    askAddress.mockResolvedValue({ address: ADDRESS });
    await expect(freighterWallet.getConnectedAccount()).resolves.toEqual({ address: ADDRESS });
  });

  it('returns null instead of throwing when the lookup errors', async () => {
    askAllowed.mockResolvedValue({ isAllowed: true });
    askAddress.mockResolvedValue({ address: '', error: 'boom' });
    await expect(freighterWallet.getConnectedAccount()).resolves.toBeNull();
  });
});

describe('signTransaction', () => {
  const passphrase = 'Test SDF Network ; September 2015';

  it('returns the signed envelope and signer', async () => {
    askSign.mockResolvedValue({ signedTxXdr: `${XDR}-signed`, signerAddress: ADDRESS });
    await expect(
      freighterWallet.signTransaction(XDR, { networkPassphrase: passphrase, address: ADDRESS }),
    ).resolves.toEqual({ signedTxXdr: `${XDR}-signed`, signerAddress: ADDRESS });
  });

  it('passes the caller-supplied network passphrase through', async () => {
    askSign.mockResolvedValue({ signedTxXdr: `${XDR}-signed`, signerAddress: ADDRESS });
    await freighterWallet.signTransaction(XDR, { networkPassphrase: passphrase, address: ADDRESS });
    expect(askSign).toHaveBeenCalledWith(XDR, { networkPassphrase: passphrase, address: ADDRESS });
  });

  it('omits the address when none was requested', async () => {
    askSign.mockResolvedValue({ signedTxXdr: `${XDR}-signed`, signerAddress: ADDRESS });
    await freighterWallet.signTransaction(XDR, { networkPassphrase: passphrase });
    expect(askSign).toHaveBeenCalledWith(XDR, { networkPassphrase: passphrase });
  });

  it('throws rather than treating an empty result as a signature', async () => {
    askSign.mockResolvedValue({ signedTxXdr: '', signerAddress: '', error: 'User declined' });
    await expect(
      freighterWallet.signTransaction(XDR, { networkPassphrase: passphrase }),
    ).rejects.toMatchObject({ code: 'rejected' });
  });

  it('rejects an envelope returned unchanged, which would look like a signature', async () => {
    askSign.mockResolvedValue({ signedTxXdr: XDR, signerAddress: ADDRESS });
    await expect(
      freighterWallet.signTransaction(XDR, { networkPassphrase: passphrase }),
    ).rejects.toMatchObject({ code: 'malformed-response' });
  });

  it('rejects a signature produced by a different account than requested', async () => {
    askSign.mockResolvedValue({
      signedTxXdr: `${XDR}-signed`,
      signerAddress: 'GDIFFERENTACCOUNT',
    });
    await expect(
      freighterWallet.signTransaction(XDR, { networkPassphrase: passphrase, address: ADDRESS }),
    ).rejects.toMatchObject({ code: 'account-mismatch' });
  });
});
