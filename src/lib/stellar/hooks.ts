import { useMemo } from 'react';
import type { rpc } from '@stellar/stellar-sdk';
import {
  getContractConfig,
  getNetworkConfig,
  getSorobanServer,
  type ContractConfig,
} from './client';
import type { NetworkConfig } from './network';
import type { InvocationContext } from './contracts/factory';
import { useWallet } from '../wallet/context';

/**
 * React bindings for chain access.
 *
 * Nothing here decides whether an action is allowed — it wires the configured
 * network, the RPC connection and the wallet session into the shapes the
 * contract clients expect.
 */

export interface StellarContext {
  readonly server: rpc.Server;
  readonly network: NetworkConfig;
  readonly contracts: ContractConfig;
}

/** The configured network, RPC server and contract addresses. */
export function useStellar(): StellarContext {
  return useMemo(
    () => ({
      server: getSorobanServer(),
      network: getNetworkConfig(),
      contracts: getContractConfig(),
    }),
    [],
  );
}

/**
 * The context a state-changing call needs, or `undefined` when there is none.
 *
 * Returning `undefined` rather than throwing is deliberate: screens render a
 * "connect a wallet" affordance instead of crashing, and a caller cannot
 * accidentally invoke a contract with no account to sign for it.
 */
export function useInvocationContext(): InvocationContext | undefined {
  const { status, address, wallet } = useWallet();
  const { server, network } = useStellar();

  return useMemo(() => {
    if (status !== 'connected' || address === undefined || wallet === undefined) {
      return undefined;
    }
    return {
      server,
      network: network.network,
      wallet,
      sourceAddress: address,
    };
  }, [status, address, wallet, server, network]);
}

/** The block explorer URL for a transaction, or `undefined` without a base URL. */
export function useExplorerTxUrl(hash: string | undefined): string | undefined {
  const { network } = useStellar();
  return useMemo(() => {
    if (hash === undefined || network.explorerBaseUrl === '') return undefined;
    return `${network.explorerBaseUrl.replace(/\/$/, '')}/tx/${hash}`;
  }, [hash, network.explorerBaseUrl]);
}
