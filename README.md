# Susu Protocol — Web Client

[![CI](https://github.com/Susu-Protocol/susu-web/actions/workflows/ci.yml/badge.svg)](https://github.com/Susu-Protocol/susu-web/actions/workflows/ci.yml)

The Susu Protocol web client — a non-custodial rotating savings protocol on Stellar.

> **Status: Phase 0 — scaffolding.** Routes are wired and the app builds, but screens are
> placeholders. Nothing here is audited or production-ready.

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

## Stack

React · Vite · TypeScript · Tailwind CSS v4 · Framer Motion · TanStack Query · React Router · Zod

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
