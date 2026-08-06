# Security Policy

## Status

The Susu Protocol web client is **in active development and has not been audited**. It
targets Stellar **Testnet only**. Do not use it with real funds.

We do not claim this software is secure, audited, or production-ready.

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Report privately using GitHub's [private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
on this repository, or email the maintainers listed in `CODEOWNERS`.

Include a description, reproduction steps or a proof of concept, the affected commit, and
any suggested remediation. We aim to acknowledge reports within **72 hours**.

## In scope

- Exposure of credentials to the browser (service-role keys, secret keys, database
  passwords, private keys) through the bundle, environment handling, or logs.
- Transaction substitution or phishing: showing details that differ from what is signed.
- Reporting success when the chain has not confirmed a transaction.
- Authentication or session handling defects in the client.
- XSS or injection through user-controlled content.
- Client-side authorization assumptions that could mislead a user about what a contract
  will actually allow.

## Out of scope

- Contract-level vulnerabilities (report in `susu-contracts`).
- Backend API vulnerabilities (report in `susu-api`).
- Indexer vulnerabilities (report in `susu-indexer`).
- Issues in third-party dependencies (report upstream).
- Missing hardening that requires an already-compromised browser or device.

## Non-negotiables

- The frontend is **never** a custodian and never holds financial authority.
- The frontend may only use the Supabase publishable/anon key.
- Chain confirmation — not wallet signature — determines success.
- Secrets never appear in the bundle, in source, or in logs.

## Disclosure

We follow coordinated disclosure and will publish an advisory once a fix is available.
