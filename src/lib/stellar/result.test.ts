import { describe, expect, it, vi } from 'vitest';
import { rpc } from '@stellar/stellar-sdk';
import {
  decideFromSendResponse,
  outcomeFromTransaction,
  pollTransactionOutcome,
  type TransactionReader,
} from './result';

const Status = rpc.Api.GetTransactionStatus;

/** Builds a `getTransaction` response of the requested status. */
function transactionResponse(
  status: rpc.Api.GetTransactionStatus,
  overrides: Record<string, unknown> = {},
): rpc.Api.GetTransactionResponse {
  const base = {
    status,
    txHash: 'deadbeef',
    latestLedger: 100,
    latestLedgerCloseTime: 0,
    oldestLedger: 1,
    oldestLedgerCloseTime: 0,
    ...overrides,
  };
  return base as unknown as rpc.Api.GetTransactionResponse;
}

/** A reader that replays a scripted sequence of responses. */
function scriptedReader(
  responses: rpc.Api.GetTransactionResponse[],
): TransactionReader & { calls: number } {
  let index = 0;
  return {
    calls: 0,
    getTransaction(): Promise<rpc.Api.GetTransactionResponse> {
      this.calls += 1;
      const response = responses[Math.min(index, responses.length - 1)];
      index += 1;
      if (response === undefined) throw new Error('scriptedReader received no responses');
      return Promise.resolve(response);
    },
  };
}

describe('decideFromSendResponse', () => {
  it('treats PENDING as awaiting confirmation, never as success', () => {
    const decision = decideFromSendResponse({ status: 'PENDING', hash: 'abc' });
    expect(decision).toEqual({ kind: 'await-confirmation', hash: 'abc' });
  });

  it('treats DUPLICATE as awaiting confirmation rather than a failure', () => {
    // A duplicate usually means an earlier submission is already being applied.
    const decision = decideFromSendResponse({ status: 'DUPLICATE', hash: 'abc' });
    expect(decision).toEqual({ kind: 'await-confirmation', hash: 'abc' });
  });

  it('treats TRY_AGAIN_LATER as retryable', () => {
    const decision = decideFromSendResponse({ status: 'TRY_AGAIN_LATER', hash: 'abc' });
    expect(decision.kind).toBe('retry');
  });

  it('treats ERROR as rejected', () => {
    const decision = decideFromSendResponse({ status: 'ERROR', hash: 'abc' });
    expect(decision.kind).toBe('rejected');
  });

  it('never reports a submission as confirmed', () => {
    const statuses = ['PENDING', 'DUPLICATE', 'TRY_AGAIN_LATER', 'ERROR'] as const;
    for (const status of statuses) {
      const decision = decideFromSendResponse({ status, hash: 'abc' });
      expect(decision.kind).not.toBe('confirmed');
    }
  });
});

describe('outcomeFromTransaction', () => {
  it('reports SUCCESS as confirmed, with the ledger it landed in', () => {
    const outcome = outcomeFromTransaction(transactionResponse(Status.SUCCESS, { ledger: 42 }));
    expect(outcome).toEqual({
      status: 'confirmed',
      hash: 'deadbeef',
      ledger: 42,
      returnValue: undefined,
    });
  });

  it('carries the contract return value from the ledger, not from the client', () => {
    // `create_group` returns the new group's address. The only trustworthy
    // source for it is the ledger's own record of the transaction, so the
    // return value is passed through untouched.
    const returnValue = { switch: () => ({ name: 'scvAddress' }) };
    const outcome = outcomeFromTransaction(
      transactionResponse(Status.SUCCESS, { ledger: 42, returnValue }),
    );

    expect(outcome.status).toBe('confirmed');
    if (outcome.status === 'confirmed') {
      expect(outcome.returnValue).toBe(returnValue);
    }
  });

  it('does not synthesize a return value when the chain reports none', () => {
    const outcome = outcomeFromTransaction(transactionResponse(Status.SUCCESS, { ledger: 42 }));
    expect(outcome.status).toBe('confirmed');
    if (outcome.status === 'confirmed') {
      expect(outcome.returnValue).toBeUndefined();
    }
  });

  it('reports FAILED as failed, with the result code when one can be read', () => {
    const resultXdr = {
      result: () => ({ switch: () => ({ name: 'txFailed' }) }),
      toXDR: () => 'AAAA',
    };
    const outcome = outcomeFromTransaction(
      transactionResponse(Status.FAILED, { ledger: 43, resultXdr }),
    );
    expect(outcome.status).toBe('failed');
    if (outcome.status === 'failed') {
      expect(outcome.reason).toContain('txFailed');
      expect(outcome.ledger).toBe(43);
    }
  });

  it('still reports FAILED when the result code cannot be decoded', () => {
    const outcome = outcomeFromTransaction(transactionResponse(Status.FAILED, { resultXdr: {} }));
    expect(outcome.status).toBe('failed');
    if (outcome.status === 'failed') {
      expect(outcome.reason).toContain('failed');
      expect(outcome.resultXdr).toBe('');
    }
  });

  it('reports NOT_FOUND as unknown rather than as failure', () => {
    const outcome = outcomeFromTransaction(transactionResponse(Status.NOT_FOUND));
    expect(outcome).toEqual({ status: 'not_found', hash: 'deadbeef' });
  });
});

describe('pollTransactionOutcome', () => {
  const noSleep = (): Promise<void> => Promise.resolve();

  it('returns confirmed only once the chain reports SUCCESS', async () => {
    const reader = scriptedReader([
      transactionResponse(Status.NOT_FOUND),
      transactionResponse(Status.SUCCESS, { ledger: 7 }),
    ]);

    const outcome = await pollTransactionOutcome(reader, 'deadbeef', { sleep: noSleep });

    expect(outcome).toEqual({
      status: 'confirmed',
      hash: 'deadbeef',
      ledger: 7,
      returnValue: undefined,
    });
    expect(reader.calls).toBe(2);
  });

  it('returns unknown, never confirmed, when the transaction never appears', async () => {
    const reader = scriptedReader([transactionResponse(Status.NOT_FOUND)]);

    const outcome = await pollTransactionOutcome(reader, 'deadbeef', {
      attempts: 3,
      sleep: noSleep,
    });

    expect(outcome).toEqual({ status: 'not_found', hash: 'deadbeef' });
    expect(outcome.status).not.toBe('confirmed');
    expect(reader.calls).toBe(3);
  });

  it('stops at a failed transaction without exhausting the budget', async () => {
    const reader = scriptedReader([
      transactionResponse(Status.NOT_FOUND),
      transactionResponse(Status.FAILED, { ledger: 9 }),
    ]);

    const outcome = await pollTransactionOutcome(reader, 'deadbeef', {
      attempts: 10,
      sleep: noSleep,
    });

    expect(outcome.status).toBe('failed');
    expect(reader.calls).toBe(2);
  });

  it('does not sleep after the final attempt', async () => {
    const reader = scriptedReader([transactionResponse(Status.NOT_FOUND)]);
    const sleep = vi.fn(noSleep);

    await pollTransactionOutcome(reader, 'deadbeef', { attempts: 3, sleep });

    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('rejects a non-positive attempt budget instead of silently doing nothing', async () => {
    const reader = scriptedReader([transactionResponse(Status.NOT_FOUND)]);
    await expect(pollTransactionOutcome(reader, 'deadbeef', { attempts: 0 })).rejects.toThrow(
      /at least one attempt/,
    );
  });
});
