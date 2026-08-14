# Susu Protocol — Web Client

[![CI](https://github.com/SISU-PROTOCOL/susu-web/actions/workflows/ci.yml/badge.svg)](https://github.com/SISU-PROTOCOL/susu-web/actions/workflows/ci.yml)

The Susu Protocol web client — a non-custodial rotating savings protocol on Stellar.

> **Status: Phase 4 — create/join/contribute flows wired to screens.** The Soroban RPC
> client, the chain-result layer, the Freighter wallet adapter, the typed Factory/Group
> contract clients, and the create/join/start/contribute/payout screens are implemented
> and tested. The flow has been exercised against the deployed Testnet contracts. Nothing
> here is audited or production-ready.

## What Susu is

Members of a group contribute a fixed amount at a fixed interval. Once every member has
contributed for the current round, the pool is paid to the scheduled recipient, minus a
transparent **0.50% (50 bps)** protocol fee. Rounds continue until every member has
received exactly one payout.

## This app is not a custodian

The frontend **cannot** move money, decide balances, choose a payout recipient, or
authorize a financial action. It builds transactions, simulates them, asks the wallet to
sign, submits them, and then reports what the chain actually did. A successful wallet
signature is never treated as success — only chain confirmation is.

## Chain access and wallets

| Module | Responsibility |
|---|---|
| `src/lib/stellar/network.ts` | Derives the network, RPC URL and passphrase from validated config. Refuses an RPC endpoint that contradicts the configured network, and refuses mainnet writes. |
| `src/lib/stellar/client.ts` | Lazily constructed Soroban RPC server and contract handles for the Factory and the USDC SAC. |
| `src/lib/stellar/result.ts` | Interprets what the chain actually said. Owns the rule that a submission is not a result. |
| `src/lib/stellar/submit.ts` | The single path a signed transaction takes to the network. |
| `src/lib/stellar/contracts/` | Typed Factory and Group clients, plus strict decoders for raw contract output. |
| `src/lib/stellar/invoke.ts` | The single pipeline every contract call takes: build → simulate → assemble → sign → submit → confirm. A call that fails simulation never reaches the wallet. |
| `src/lib/susu/` | USDC amounts as exact integer stroops, and the React Query hooks that read and mutate group state. |
| `src/lib/wallet/` | Wallet interface, registry, and the Freighter adapter (MVP). |

### Why raw contract output is decoded defensively

Contract reads arrive as loosely-typed native values, so every field is validated before it
reaches the UI. A `#[contracttype]` unit enum, for example, decodes to `["Active"]` — a
single-element array, not `"Active"`. That shape was confirmed by reading the deployed
Testnet contract rather than assumed; an earlier decoder that required a bare string passed
against its own fixtures and failed against every real group.

Amounts are carried as `bigint` stroops end to end and never converted to floating point,
and the local fee preview reuses the contract's own integer split so the two cannot disagree.

### Why the result layer exists

A wallet signature proves only that a user authorized something, and a node accepting a
transaction proves only that the envelope reached its mempool. Neither means money moved.
So the app distinguishes four outcomes, and never collapses them:

- `confirmed` — the ledger reports `SUCCESS`. The only success.
- `failed` — the ledger reports `FAILED`. The transaction was applied and rejected.
- `unknown` — the network never reported it within the polling budget. Presented as
  unknown, never as success or failure.
- `retry` / `rejected` — the node declined to accept it.

`DUPLICATE` on submission is treated the same as `PENDING`, because it usually means an
earlier attempt is already being applied, not that the request failed.

The Freighter adapter also rejects two responses that would otherwise look like
signatures: an envelope returned unchanged, and a signature produced by a different
account than the one requested (which usually means the active account was switched).

## Stack

React · Vite · TypeScript · Tailwind CSS v4 · Framer Motion · TanStack Query · React Router · Zod · Stellar SDK · Freighter

## Routes

| Route | Purpose |
|---|---|
| `/` | Landing |
| `/login`, `/signup` | Authentication |
| `/forgot-password`, `/reset-password` | Password recovery |
| `/join/:inviteCode` | Join via invite |
| `/app` | Overview |
| `/app/groups` | Group list |
| `/app/groups/create` | Create a group |
| `/app/groups/:id` | Group detail |
| `/app/activity` | Activity |
| `/app/settings` | Settings |
| `/app/transactions/:hash` | Transaction detail |

## Development

Requires Node ≥ 22 and pnpm.

```bash
pnpm install
cp .env.example .env    # then fill in values
pnpm dev
```

## Checks

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Configuration

All configuration is browser-visible. **Only the Supabase publishable/anon key may appear in
frontend environment variables.** `src/lib/env.ts` validates configuration at runtime and
refuses to start if it detects a service-role key, secret key, database URL, or other
server-side credential — including an `anon` variable that actually contains a
`service_role` token.

## Security

This app is unaudited. See [`SECURITY.md`](SECURITY.md) for reporting. Never place
credentials in this repository, and never commit a populated `.env`.

## License

[MIT](LICENSE)
