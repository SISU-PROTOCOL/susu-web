import { describe, expect, it, vi } from 'vitest';

vi.mock('@stellar/freighter-api', () => ({
  getAddress: vi.fn(),
  isAllowed: vi.fn(),
  isConnected: vi.fn(),
  requestAccess: vi.fn(),
  signTransaction: vi.fn(),
}));

import { isConnected } from '@stellar/freighter-api';
import { WALLETS, getWallet, listAvailableWallets } from './index';

const askConnected = isConnected as unknown as ReturnType<typeof vi.fn>;

describe('wallet registry', () => {
  it('registers Freighter as the MVP wallet', () => {
    expect(WALLETS.map((wallet) => wallet.id)).toEqual(['freighter']);
  });

  it('resolves a registered wallet by id', () => {
    expect(getWallet('freighter').name).toBe('Freighter');
  });

  it('throws for an unregistered id rather than returning undefined', () => {
    expect(() => getWallet('metamask' as never)).toThrow(/Unknown wallet/);
  });

  it('lists available wallets by probing, not by assumption', async () => {
    askConnected.mockResolvedValue({ isConnected: true });
    await expect(listAvailableWallets()).resolves.toHaveLength(1);

    askConnected.mockResolvedValue({ isConnected: false, error: 'not installed' });
    await expect(listAvailableWallets()).resolves.toEqual([]);
  });
});
