# Susu Protocol — Web Client

[![CI](https://github.com/SISU-PROTOCOL/susu-web/actions/workflows/ci.yml/badge.svg)](https://github.com/SISU-PROTOCOL/susu-web/actions/workflows/ci.yml)

The Susu Protocol web client — a non-custodial rotating savings protocol on Stellar.

> **Status: Phase 3 — Stellar client and wallet abstraction.** The Soroban RPC client,
> the chain-result interpretation layer, and the Freighter wallet adapter are implemented
> and tested. Screens are still placeholders and no wallet-signed transaction is wired to
> a screen yet. Nothing here is audited or production-ready.

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
| `src/lib/wallet/` | Wallet interface, registry, and the Freighter adapter (MVP). |

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
