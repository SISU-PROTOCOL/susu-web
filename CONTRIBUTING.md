# Contributing to the Susu Web Client

Thanks for your interest. This is the client for a financial protocol, so correctness and
honesty in the UI matter as much as they do on-chain.

## Before you start

- Read `README.md` and `SECURITY.md`.
- Anything that changes how money appears, what a user is asked to sign, or what is
  reported as confirmed needs maintainer review first. Open an issue before a PR.

## Ground rules

1. **Never** put a service-role key, secret key, database password, or private key in
   frontend code or environment variables. Only the publishable/anon key is allowed.
2. **Never** report a transaction as successful because the wallet signature succeeded —
   success comes from chain confirmation only.
3. **Never** compute or display money with floating-point arithmetic.
4. **Never** display invented balances, returns, statistics, or testimonials.
5. **Never** imply that this software is audited or secure.
6. Prefer accessible, responsive components with explicit loading, empty, pending, success,
   and failure states.

## Development setup

```bash
pnpm install
cp .env.example .env
pnpm dev
```

## Checks before opening a PR

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Testing requirements

Add tests for new logic, including negative paths. At minimum, cover:

- Environment/configuration validation and refusal of elevated credentials.
- Transaction state handling, including rejected signatures, simulation failures, RPC
  failures, timeouts, and delayed indexing.
- Accessible form behavior for authentication and recovery flows.

## Commit messages

Clear, imperative subject lines. Reference issues where applicable. Do not add co-author
trailers for tooling.

## Pull requests

Fill in the PR template, especially the security impact section. Keep PRs focused. CI must
be green.

## License

By contributing you agree that your contributions are licensed under the [MIT License](LICENSE).
