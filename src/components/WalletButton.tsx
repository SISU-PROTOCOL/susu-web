import { useWallet } from '@/lib/wallet/context';
import { AddressChip, Button } from './ui';

/**
 * Wallet connection control.
 *
 * Connection is always a deliberate click. Nothing here runs on mount, so
 * opening a page never opens a wallet window.
 */
export function WalletButton() {
  const { status, address, error, connect, disconnect } = useWallet();

  if (status === 'checking') {
    return <span className="text-sm text-neutral-500">Checking for a wallet…</span>;
  }

  if (status === 'connected' && address !== undefined) {
    return (
      <span className="flex items-center gap-3">
        <AddressChip value={address} />
        <Button variant="ghost" onClick={disconnect}>
          Disconnect
        </Button>
      </span>
    );
  }

  if (status === 'unavailable') {
    return (
      <span className="text-sm text-neutral-500">
        No Stellar wallet found.{' '}
        <a
          href="https://www.freighter.app/"
          target="_blank"
          rel="noreferrer noopener"
          className="underline underline-offset-2"
        >
          Install Freighter
        </a>
      </span>
    );
  }

  return (
    <span className="flex items-center gap-3">
      <Button onClick={() => void connect()} pending={status === 'connecting'}>
        Connect wallet
      </Button>
      {error !== undefined && error.code !== 'rejected' ? (
        <span className="text-xs text-red-600 dark:text-red-400">{error.message}</span>
      ) : null}
    </span>
  );
}
