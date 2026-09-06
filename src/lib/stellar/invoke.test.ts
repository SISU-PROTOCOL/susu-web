import { describe, expect, it } from 'vitest';
import {
  Account,
  Address,
  Contract,
  Networks,
  SorobanDataBuilder,
  Transaction,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  xdr,
} from '@stellar/stellar-sdk';
import { invokeContract, readContract, READ_ONLY_SOURCE, type ContractServer } from './invoke';
import { WalletError, type WalletAdapter } from '../wallet';

const GROUP = 'CDK6IB7PR3HFNOLH4R37ODLVTNYCVT2NX4SIBWKQXLKJNHJJU3PEWGA7';
const HASH = 'deadbeef';

/** Keeps confirmation polling from waiting in real time during tests. */
const NO_WAIT = { attempts: 2, sleep: () => Promise.resolve() } as const;

function groupContract(): Contract {
  return new Contract(GROUP);
}

/** A wallet that records whether it was ever asked to sign. */
function fakeWallet(options: { behaviour?: 'sign' | 'reject' } = {}): WalletAdapter & {
  signCalls: number;
} {
  const behaviour = options.behaviour ?? 'sign';
  return {
    id: 'freighter',
    name: 'Freighter',
    signCalls: 0,
    isAvailable: () => Promise.resolve(true),
    connect: () => Promise.resolve({ address: READ_ONLY_SOURCE }),
    getConnectedAccount: () => Promise.resolve({ address: READ_ONLY_SOURCE }),
    signTransaction(xdrString: string) {
      this.signCalls += 1;
      if (behaviour === 'reject') {
        return Promise.reject(new WalletError('rejected', 'The user declined.'));
      }
      return Promise.resolve({ signedTxXdr: xdrString, signerAddress: READ_ONLY_SOURCE });
    },
    signMessage() {
      return Promise.reject(new WalletError('unavailable', 'This fake wallet signs no messages.'));
    },
  };
}

function successSimulation(retval: xdr.ScVal): rpc.Api.SimulateTransactionResponse {
  return {
    // Marks the response as already parsed. Without it the SDK assumes raw
    // JSON-RPC and tries to re-parse `transactionData`, which is already a
    // builder here.
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

function transactionResponse(status: rpc.Api.GetTransactionStatus): rpc.Api.GetTransactionResponse {
  return { status, txHash: HASH, ledger: 60 } as unknown as rpc.Api.GetTransactionResponse;
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

describe('readContract', () => {
  it('returns the decoded value from a successful simulation', async () => {
    const server = fakeServer({
      simulation: successSimulation(nativeToScVal(42, { type: 'u32' })),
    });

    const result = await readContract(
      server,
      'testnet',
      groupContract(),
      'get_member_count',
      [],
      (native) => Number(native),
    );

    expect(result).toEqual({ ok: true, value: 42 });
  });

  it('returns a decoded contract error instead of throwing', async () => {
    const server = fakeServer({
      simulation: errorSimulation('HostError: Error(Contract, #6)\n\nEvent log:'),
    });

    const result = await readContract(
      server,
      'testnet',
      groupContract(),
      'get_round',
      [],
      (native) => native,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.kind).toBe('contract-error');
      if (result.failure.kind === 'contract-error') {
        expect(result.failure.name).toBe('AlreadyMember');
      }
    }
  });

  it('reports an unreachable network as opaque, not as a rules rejection', async () => {
    const server: ContractServer = {
      ...fakeServer({ simulation: successSimulation(nativeToScVal(1, { type: 'u32' })) }),
      simulateTransaction: () => Promise.reject(new Error('socket hang up')),
    };

    const result = await readContract(
      server,
      'testnet',
      groupContract(),
      'get_round',
      [],
      (native) => native,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.kind).toBe('opaque');
    }
  });

  it('uses a fixed read-only source rather than the connected account', async () => {
    let sawSource: string | undefined;
    const server: ContractServer = {
      ...fakeServer({ simulation: successSimulation(nativeToScVal(1, { type: 'u32' })) }),
      simulateTransaction: (transaction) => {
        sawSource = transaction.source;
        return Promise.resolve(successSimulation(nativeToScVal(1, { type: 'u32' })));
      },
    };

    await readContract(server, 'testnet', groupContract(), 'get_member_count', [], (n) =>
      Number(n),
    );

    expect(sawSource).toBe(READ_ONLY_SOURCE);
  });

  it('builds the simulation for the configured network passphrase', async () => {
    let sawPassphrase: string | undefined;
    const server: ContractServer = {
      ...fakeServer({ simulation: successSimulation(nativeToScVal(1, { type: 'u32' })) }),
      simulateTransaction: (transaction) => {
        sawPassphrase = (transaction as unknown as { networkPassphrase?: string })
          .networkPassphrase;
        return Promise.resolve(successSimulation(nativeToScVal(1, { type: 'u32' })));
      },
    };

    await readContract(server, 'testnet', groupContract(), 'get_member_count', [], (n) =>
      Number(n),
    );

    expect(sawPassphrase).toBe(Networks.TESTNET);
  });

  it('cannot submit anything, because a read is given no means to submit', async () => {
    // Structural rather than behavioural: the server handed to `readContract`
    // here has no `sendTransaction` and no `getTransaction`. A read that tried
    // to submit would fail outright.
    const readOnlyServer = {
      getAccount: (address: string) => Promise.resolve(new Account(address, '0')),
      simulateTransaction: () =>
        Promise.resolve(successSimulation(nativeToScVal(7, { type: 'u32' }))),
    } as unknown as ContractServer;

    const result = await readContract(
      readOnlyServer,
      'testnet',
      groupContract(),
      'get_member_count',
      [],
      (native) => Number(native),
    );

    expect(result).toEqual({ ok: true, value: 7 });
  });
});

describe('invokeContract', () => {
  it('never asks the wallet to sign a call the contract rejects', async () => {
    // This is why the simulation step exists. A member who has already
    // contributed must be told so, not prompted to approve a doomed transaction.
    const wallet = fakeWallet();
    const server = fakeServer({ simulation: errorSimulation('HostError: Error(Contract, #13)') });

    const outcome = await invokeContract({
      server,
      network: 'testnet',
      wallet,
      sourceAddress: READ_ONLY_SOURCE,
      contract: groupContract(),
      method: 'contribute',
      args: [],
      poll: NO_WAIT,
    });

    expect(outcome.status).toBe('invalid');
    if (outcome.status === 'invalid') {
      expect(outcome.failure.kind).toBe('contract-error');
      if (outcome.failure.kind === 'contract-error') {
        expect(outcome.failure.name).toBe('AlreadyContributed');
      }
    }
    expect(wallet.signCalls).toBe(0);
  });

  it('signs, submits and reports confirmed with the chain return value', async () => {
    const wallet = fakeWallet();
    const addressScVal = new Address(GROUP).toScVal();
    const server = fakeServer({
      simulation: successSimulation(addressScVal),
      transaction: confirmedTransaction(addressScVal),
    });

    const outcome = await invokeContract({
      server,
      network: 'testnet',
      wallet,
      sourceAddress: READ_ONLY_SOURCE,
      contract: groupContract(),
      method: 'create_group',
      args: [],
      poll: NO_WAIT,
    });

    expect(wallet.signCalls).toBe(1);
    expect(outcome.status).toBe('confirmed');
    if (outcome.status === 'confirmed') {
      expect(outcome.returnValue).toBe(addressScVal);
      expect(outcome.ledger).toBe(55);
    }
  });

  it('reports a transaction the ledger rejected as failed, not as success', async () => {
    const server = fakeServer({
      simulation: successSimulation(nativeToScVal(1, { type: 'u32' })),
      transaction: transactionResponse(rpc.Api.GetTransactionStatus.FAILED),
    });

    const outcome = await invokeContract({
      server,
      network: 'testnet',
      wallet: fakeWallet(),
      sourceAddress: READ_ONLY_SOURCE,
      contract: groupContract(),
      method: 'start',
      args: [],
      poll: NO_WAIT,
    });

    expect(outcome.status).toBe('failed');
  });

  it('reports a transaction the network never confirmed as unknown', async () => {
    const server = fakeServer({
      simulation: successSimulation(nativeToScVal(1, { type: 'u32' })),
      transaction: transactionResponse(rpc.Api.GetTransactionStatus.NOT_FOUND),
    });

    const outcome = await invokeContract({
      server,
      network: 'testnet',
      wallet: fakeWallet(),
      sourceAddress: READ_ONLY_SOURCE,
      contract: groupContract(),
      method: 'start',
      args: [],
      poll: NO_WAIT,
    });

    expect(outcome.status).toBe('unknown');
    expect(outcome.status).not.toBe('confirmed');
  });

  it('propagates a wallet rejection', async () => {
    const wallet = fakeWallet({ behaviour: 'reject' });
    const server = fakeServer({ simulation: successSimulation(nativeToScVal(1, { type: 'u32' })) });

    await expect(
      invokeContract({
        server,
        network: 'testnet',
        wallet,
        sourceAddress: READ_ONLY_SOURCE,
        contract: groupContract(),
        method: 'start',
        args: [],
        poll: NO_WAIT,
      }),
    ).rejects.toThrow(WalletError);

    expect(wallet.signCalls).toBe(1);
  });

  it('refuses to write to mainnet, before involving the wallet', async () => {
    const wallet = fakeWallet();
    const server = fakeServer({ simulation: successSimulation(nativeToScVal(1, { type: 'u32' })) });

    await expect(
      invokeContract({
        server,
        network: 'mainnet',
        wallet,
        sourceAddress: READ_ONLY_SOURCE,
        contract: groupContract(),
        method: 'start',
        args: [],
        poll: NO_WAIT,
      }),
    ).rejects.toThrow(/mainnet/i);

    // The user was never asked to approve anything.
    expect(wallet.signCalls).toBe(0);
  });

  it('refuses to submit a transaction the wallet substituted for the one it was given', async () => {
    // A wallet is a program we do not control, and it returns XDR as text, so
    // it can return anything it likes. The signature only proves that whatever
    // came back was authorized by the key — not that it is the transaction this
    // app simulated and showed the user.
    let submissions = 0;
    const server: ContractServer = {
      ...fakeServer({ simulation: successSimulation(nativeToScVal(1, { type: 'u32' })) }),
      sendTransaction: () => {
        submissions += 1;
        return Promise.resolve({
          status: 'PENDING',
          hash: HASH,
          latestLedger: 100,
        } as unknown as rpc.Api.SendTransactionResponse);
      },
    };

    const wallet: WalletAdapter = {
      ...fakeWallet(),
      signTransaction(xdrString: string) {
        const handed = TransactionBuilder.fromXDR(xdrString, Networks.TESTNET) as Transaction;

        // The same account, fee and sequence, but paying out instead of
        // contributing: a substitution a user could not tell apart.
        const substitute = new TransactionBuilder(
          new Account(handed.source, (BigInt(handed.sequence) - 1n).toString()),
          { fee: handed.fee, networkPassphrase: Networks.TESTNET },
        )
          .addOperation(new Contract(GROUP).call('execute_payout'))
          .setTimeout(60)
          .build();

        return Promise.resolve({
          signedTxXdr: substitute.toXDR(),
          signerAddress: READ_ONLY_SOURCE,
        });
      },
    };

    await expect(
      invokeContract({
        server,
        network: 'testnet',
        wallet,
        sourceAddress: READ_ONLY_SOURCE,
        contract: groupContract(),
        method: 'contribute',
        args: [],
        poll: NO_WAIT,
      }),
    ).rejects.toThrow(/different transaction/i);

    // Nothing reached the network.
    expect(submissions).toBe(0);
  });

  it('describes what a substituted transaction changed', async () => {
    let message = '';
    const server = fakeServer({ simulation: successSimulation(nativeToScVal(1, { type: 'u32' })) });

    const wallet: WalletAdapter = {
      ...fakeWallet(),
      signTransaction(xdrString: string) {
        const handed = TransactionBuilder.fromXDR(xdrString, Networks.TESTNET) as Transaction;

        // Same account, fee and sequence — only the call itself differs, which
        // is the substitution the message has to be able to describe.
        const substitute = new TransactionBuilder(
          new Account(handed.source, (BigInt(handed.sequence) - 1n).toString()),
          { fee: handed.fee, networkPassphrase: Networks.TESTNET },
        )
          .addOperation(new Contract(GROUP).call('execute_payout'))
          .setTimeout(60)
          .build();

        return Promise.resolve({
          signedTxXdr: substitute.toXDR(),
          signerAddress: READ_ONLY_SOURCE,
        });
      },
    };

    try {
      await invokeContract({
        server,
        network: 'testnet',
        wallet,
        sourceAddress: READ_ONLY_SOURCE,
        contract: groupContract(),
        method: 'contribute',
        args: [],
        poll: NO_WAIT,
      });
    } catch (cause) {
      message = cause instanceof Error ? cause.message : String(cause);
    }

    // The call that was substituted is named, rather than the message being a
    // generic refusal the user cannot act on.
    expect(message).toMatch(/an operation or its arguments/);
  });
});
