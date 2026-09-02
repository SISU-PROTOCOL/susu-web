import { describe, expect, it } from 'vitest';
import {
  Account,
  SorobanDataBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk';
import type { ContractServer } from '../invoke';
import { WalletError, type WalletAdapter } from '../../wallet';
import {
  contribute,
  contributeArgs,
  joinArgs,
  joinGroup,
  readGroupSnapshot,
  startGroup,
} from './group';

const GROUP = 'CDK6IB7PR3HFNOLH4R37ODLVTNYCVT2NX4SIBWKQXLKJNHJJU3PEWGA7';
const ACCOUNT = 'GAGXKUDVJYEABJOSG7XPLATAGV3GXGZ6LIKYNCUUBKZITFMHRDR3BMEA';
const HASH = 'deadbeef';

/**
 * The XDR type name of a value, e.g. `scvU32`.
 *
 * `nativeToScVal` returns a specific ScVal subtype rather than the base union,
 * so its shape is inspected directly instead of through the base typings.
 */
function xdrType(value: unknown): string {
  const type = (value as { type?: unknown }).type;
  if (typeof type !== 'string') {
    throw new Error('Expected an XDR value with a type discriminator.');
  }
  return type;
}

function fakeWallet(): WalletAdapter & { signCalls: number } {
  return {
    id: 'freighter',
    name: 'Freighter',
    signCalls: 0,
    isAvailable: () => Promise.resolve(true),
    connect: () => Promise.resolve({ address: ACCOUNT }),
    getConnectedAccount: () => Promise.resolve({ address: ACCOUNT }),
    signTransaction(xdrString: string) {
      this.signCalls += 1;
      return Promise.resolve({ signedTxXdr: xdrString, signerAddress: ACCOUNT });
    },
    signMessage() {
      return Promise.reject(new WalletError('unavailable', 'This fake wallet signs no messages.'));
    },
  };
}

function successSimulation(retval: xdr.ScVal): rpc.Api.SimulateTransactionResponse {
  return {
    // Already-parsed marker: without it the SDK assumes raw JSON-RPC and tries
    // to re-parse `transactionData`, which is a builder here.
    _parsed: true,
    id: '1',
    latestLedger: 100,
    transactionData: new SorobanDataBuilder(),
    minResourceFee: '100',
    result: { auth: [], retval },
    events: [],
    stateChanges: [],
  } as unknown as rpc.Api.SimulateTransactionResponse;
}

function errorSimulation(message: string): rpc.Api.SimulateTransactionResponse {
  return {
    _parsed: true,
    id: '1',
    latestLedger: 100,
    error: message,
    events: [],
  } as unknown as rpc.Api.SimulateTransactionResponse;
}

function confirmedTransaction(returnValue?: xdr.ScVal): rpc.Api.GetTransactionResponse {
  return {
    status: rpc.Api.GetTransactionStatus.SUCCESS,
    txHash: HASH,
    ledger: 55,
    returnValue,
  } as unknown as rpc.Api.GetTransactionResponse;
}

interface FakeServerOptions {
  readonly simulation: rpc.Api.SimulateTransactionResponse;
  readonly transaction?: rpc.Api.GetTransactionResponse;
}

function fakeServer(options: FakeServerOptions): ContractServer {
  return {
    getAccount: (address) => Promise.resolve(new Account(address, '1')),
    simulateTransaction: () => Promise.resolve(options.simulation),
    sendTransaction: () =>
      Promise.resolve({
        status: 'PENDING',
        hash: HASH,
        latestLedger: 100,
      } as unknown as rpc.Api.SendTransactionResponse),
    getTransaction: () => Promise.resolve(options.transaction ?? confirmedTransaction()),
  };
}

function contextFor(server: ContractServer, wallet: WalletAdapter = fakeWallet()) {
  return {
    server,
    network: 'testnet' as const,
    wallet,
    sourceAddress: ACCOUNT,
  };
}

/**
 * A group action is confirmed only after the ledger says so, so the return value
 * can only be decoded once the money has already moved. Decoding it is therefore
 * not allowed to throw: a throw would reach React Query as a failed mutation and
 * tell a member their join or contribution failed when the chain recorded it.
 */
describe('invokeGroupMethod post-confirmation decoding', () => {
  it('reports a confirmed join with the decoded member position', async () => {
    const position = nativeToScVal(2, { type: 'u32' });
    const server = fakeServer({
      simulation: successSimulation(position),
      transaction: confirmedTransaction(position),
    });

    const outcome = await joinGroup(contextFor(server), GROUP);

    expect(outcome.status).toBe('confirmed');
    if (outcome.status === 'confirmed') {
      expect(outcome.value).toBe(2);
      expect(outcome.ledger).toBe(55);
    }
  });

  it('reports an undecodable result as unreadable instead of throwing', async () => {
    // `join` returns a u32 position. A string is not one, so the decoder throws.
    // The transaction has already been confirmed at this point, so the caller
    // must be told the join succeeded but its result could not be read -- not
    // that the join failed.
    const nonsense = nativeToScVal('not-a-position');
    const server = fakeServer({
      simulation: successSimulation(nonsense),
      transaction: confirmedTransaction(nonsense),
    });

    // If this threw, the test fails -- which is exactly the behaviour under test.
    // A rejected promise here would mean a confirmed join was reported as failed.
    const outcome = await joinGroup(contextFor(server), GROUP);

    expect(outcome.status).toBe('invalid');
    if (outcome.status === 'invalid') {
      expect(outcome.failure.kind).toBe('opaque');
      expect(outcome.failure.message).toMatch(/result could not be read/i);
    }
  });
  it('reports a confirmed call with no return value as invalid, not as success', async () => {
    const position = nativeToScVal(1, { type: 'u32' });
    const server = fakeServer({
      simulation: successSimulation(position),
      transaction: confirmedTransaction(undefined),
    });

    const outcome = await joinGroup(contextFor(server), GROUP);

    expect(outcome.status).toBe('invalid');
  });

  it('does not report a confirmed transaction as failed', async () => {
    const nonsense = nativeToScVal('not-a-position');
    const server = fakeServer({
      simulation: successSimulation(nonsense),
      transaction: confirmedTransaction(nonsense),
    });

    const outcome = await joinGroup(contextFor(server), GROUP);

    expect(outcome.status).not.toBe('failed');
    expect(outcome.status).not.toBe('confirmed');
  });
});

describe('group action argument encoding', () => {
  it('encodes a contribution as an address, an i128 and a u32', () => {
    const args = contributeArgs(ACCOUNT, 100_000_000n, 1);

    // The contract rejects a wrong type, but only after the user has signed, so
    // the encoding is asserted here rather than discovered on-chain.
    expect(args).toHaveLength(3);
    expect(xdrType(args[0])).toBe('scvAddress');
    expect(xdrType(args[1])).toBe('scvI128');
    expect(xdrType(args[2])).toBe('scvU32');
  });

  it('preserves the exact contribution amount and round', () => {
    const args = contributeArgs(ACCOUNT, 100_000_000n, 1);

    expect(scValToNative(args[1]!)).toBe(100_000_000n);
    expect(scValToNative(args[2]!)).toBe(1);
  });

  it('preserves a contribution amount beyond the safe integer range', () => {
    // The whole point of the i128 encoding: a 7-decimal token amount can exceed
    // what a double represents exactly.
    const huge = 2n ** 70n + 1n;

    expect(scValToNative(contributeArgs(ACCOUNT, huge, 1)[1]!)).toBe(huge);
  });

  it('encodes a join as the member address alone', () => {
    const args = joinArgs(ACCOUNT);

    expect(args).toHaveLength(1);
    expect(xdrType(args[0])).toBe('scvAddress');
    expect(scValToNative(args[0]!)).toBe(ACCOUNT);
  });

  it('never asks the wallet to sign a contribution the contract rejects', async () => {
    const wallet = fakeWallet();
    const server = fakeServer({
      simulation: errorSimulation('HostError: Error(Contract, #13)\n\nEvent log:'),
    });

    const outcome = await contribute(contextFor(server, wallet), GROUP, 100_000_000n, 1);

    expect(outcome.status).toBe('invalid');
    if (outcome.status === 'invalid' && outcome.failure.kind === 'contract-error') {
      expect(outcome.failure.name).toBe('AlreadyContributed');
    }
    expect(wallet.signCalls).toBe(0);
  });

  it('reports a wallet rejection for a start rather than swallowing it', async () => {
    const wallet: WalletAdapter = {
      ...fakeWallet(),
      signTransaction: () => Promise.reject(new WalletError('rejected', 'The user declined.')),
    };
    const server = fakeServer({
      simulation: successSimulation(nativeToScVal(1, { type: 'u32' })),
    });

    await expect(startGroup(contextFor(server, wallet), GROUP)).rejects.toThrow(WalletError);
  });
});

describe('readGroupSnapshot', () => {
  it('decodes the enum array shape the network actually sends', async () => {
    // Confirmed against the deployed Testnet contract: a unit enum arrives as a
    // single-element array, not a bare string.
    const state = {
      config: {
        factory: 'CCC7KAX4V4GJD6FVG6GSYQ4I2D2B3CWEOQMIX6YM4QBGXTA6INCGRUYC',
        creator: 'GBPJ3JJLZ7XPV6CGF3ABPSTXAATKRBCU2L6P66LHCGLYPBVMJX5BEFH6',
        token: 'CDK6IB7PR3HFNOLH4R37ODLVTNYCVT2NX4SIBWKQXLKJNHJJU3PEWGA7',
        treasury: 'GBG4MSIEUTONQSE7SSUQ6QZTQPNMKCSESZ6TZKZCMZRMAKZSDO6QPCYK',
        contribution_amount: 100_000_000n,
        member_capacity: 3,
        frequency_seconds: 604_800n,
        fee_bps: 50,
      },
      status: ['Active'],
      current_round: 1,
      member_count: 3,
      round_phase: ['WaitingForContributions'],
    };

    const server = fakeServer({ simulation: successSimulation(nativeToScVal(state)) });

    const result = await readGroupSnapshot({
      server,
      network: 'testnet',
      groupAddress: GROUP,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('Active');
      expect(result.value.roundPhase).toBe('WaitingForContributions');
      expect(result.value.currentRound).toBe(1);
    }
  });
});
