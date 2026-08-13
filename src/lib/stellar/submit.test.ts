import { describe, expect, it } from 'vitest';
import { rpc, Transaction } from '@stellar/stellar-sdk';
import { submitAndConfirm, type TransactionSubmitter } from './submit';
import type { TransactionReader } from './result';

const Status = rpc.Api.GetTransactionStatus;

const FAKE_TX = {} as unknown as Transaction;
const HASH = 'deadbeef';

function sendResponse(status: string): rpc.Api.SendTransactionResponse {
  return { status, hash: HASH, latestLedger: 100 } as unknown as rpc.Api.SendTransactionResponse;
}

function txResponse(
  status: rpc.Api.GetTransactionStatus,
  ledger = 50,
): rpc.Api.GetTransactionResponse {
  return { status, txHash: HASH, ledger } as unknown as rpc.Api.GetTransactionResponse;
}

/** A server that sends a scripted status and reports scripted transaction states. */
function fakeServer(
  send: rpc.Api.SendTransactionResponse,
  transactions: rpc.Api.GetTransactionResponse[],
): TransactionSubmitter & TransactionReader & { sends: number } {
  let index = 0;
  return {
    sends: 0,
    sendTransaction(): Promise<rpc.Api.SendTransactionResponse> {
      this.sends += 1;
      return Promise.resolve(send);
    },
    getTransaction(): Promise<rpc.Api.GetTransactionResponse> {
      const response = transactions[Math.min(index, transactions.length - 1)];
      index += 1;
      if (response === undefined) throw new Error('no scripted transaction responses');
      return Promise.resolve(response);
    },
  };
}

const noSleep = (): Promise<void> => Promise.resolve();
const options = { network: 'testnet' as const, poll: { sleep: noSleep } };

describe('submitAndConfirm', () => {
  it('does not report success from a PENDING submission alone', async () => {
    // The node accepted the envelope, but the transaction is not in a ledger.
    const server = fakeServer(sendResponse('PENDING'), [txResponse(Status.NOT_FOUND)]);

    const result = await submitAndConfirm(server, FAKE_TX, {
      network: 'testnet',
      poll: { attempts: 2, sleep: noSleep },
    });

    expect(result.status).toBe('unknown');
    expect(result.status).not.toBe('confirmed');
  });

  it('reports confirmed only after the ledger says SUCCESS', async () => {
    const server = fakeServer(sendResponse('PENDING'), [
      txResponse(Status.NOT_FOUND),
      txResponse(Status.SUCCESS, 77),
    ]);

    const result = await submitAndConfirm(server, FAKE_TX, options);

    expect(result).toEqual({ status: 'confirmed', hash: HASH, ledger: 77 });
  });

  it('polls on DUPLICATE rather than failing, since an earlier attempt may be landing', async () => {
    const server = fakeServer(sendResponse('DUPLICATE'), [txResponse(Status.SUCCESS, 80)]);

    const result = await submitAndConfirm(server, FAKE_TX, options);

    expect(result).toEqual({ status: 'confirmed', hash: HASH, ledger: 80 });
  });

  it('reports failed, with the ledger, when the transaction is applied and fails', async () => {
    const server = fakeServer(sendResponse('PENDING'), [txResponse(Status.FAILED, 81)]);

    const result = await submitAndConfirm(server, FAKE_TX, options);

    expect(result.status).toBe('failed');
  });

  it('surfaces TRY_AGAIN_LATER as retryable without polling', async () => {
    const server = fakeServer(sendResponse('TRY_AGAIN_LATER'), [txResponse(Status.NOT_FOUND)]);

    const result = await submitAndConfirm(server, FAKE_TX, options);

    expect(result.status).toBe('retry');
  });

  it('surfaces a rejected transaction without polling', async () => {
    const server = fakeServer(sendResponse('ERROR'), [txResponse(Status.NOT_FOUND)]);

    const result = await submitAndConfirm(server, FAKE_TX, options);

    expect(result.status).toBe('rejected');
  });

  it('refuses to submit to mainnet', async () => {
    const server = fakeServer(sendResponse('PENDING'), [txResponse(Status.SUCCESS)]);

    await expect(submitAndConfirm(server, FAKE_TX, { network: 'mainnet' })).rejects.toThrow(
      /readiness gate/,
    );
    expect(server.sends).toBe(0);
  });
});
