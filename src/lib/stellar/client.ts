import { Contract, rpc } from '@stellar/stellar-sdk';
import { getEnv } from '../env';
import { resolveNetworkConfig, type NetworkConfig } from './network';

/**
 * Soroban RPC client and contract handles.
 *
 * The server and the contract handles are created lazily so that builds and
 * tests do not require a populated `.env`, and cached so a session reuses one
 * connection rather than opening a new one per call.
 *
 * Contract addresses are public `C...` identifiers. They are configuration, not
 * credentials, and they are never used to authorize anything: authorization
 * always comes from the user's wallet.
 */

let cachedConfig: NetworkConfig | undefined;
let cachedServer: rpc.Server | undefined;

export function getNetworkConfig(): NetworkConfig {
  if (cachedConfig === undefined) {
    cachedConfig = resolveNetworkConfig(getEnv());
  }
  return cachedConfig;
}

export function getSorobanServer(): rpc.Server {
  if (cachedServer === undefined) {
    const { rpcUrl } = getNetworkConfig();
    cachedServer = new rpc.Server(rpcUrl, {
      allowHttp: rpcUrl.startsWith('http://'),
    });
  }
  return cachedServer;
}

export interface ContractConfig {
  /** Protocol Factory. Groups are created through it. */
  readonly factoryId: string;
  /** USDC SAC. The only asset the protocol accepts. */
  readonly usdcId: string;
}

export function getContractConfig(): ContractConfig {
  const env = getEnv();
  return {
    factoryId: env.VITE_FACTORY_CONTRACT_ID,
    usdcId: env.VITE_USDC_CONTRACT_ID,
  };
}

function requireContractId(id: string, name: string): string {
  if (id === '') {
    throw new Error(
      `${name} is not configured. Set it in your .env — see .env.example for the ` +
        'deployed Testnet addresses.',
    );
  }
  return id;
}

/** Handle for the protocol Factory. Throws if no address is configured. */
export function getFactoryContract(): Contract {
  const { factoryId } = getContractConfig();
  return new Contract(requireContractId(factoryId, 'VITE_FACTORY_CONTRACT_ID'));
}

/** Handle for the USDC SAC. Throws if no address is configured. */
export function getUsdcContract(): Contract {
  const { usdcId } = getContractConfig();
  return new Contract(requireContractId(usdcId, 'VITE_USDC_CONTRACT_ID'));
}

/** Clears cached configuration. Tests only. */
export function resetStellarClientForTests(): void {
  cachedConfig = undefined;
  cachedServer = undefined;
}
