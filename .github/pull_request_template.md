# Pull Request

## Summary

<!-- What does this change and why? -->

## Repository

- [ ] `susu-web`
- [ ] `susu-contracts`
- [ ] `susu-api`
- [ ] `susu-indexer`

## Type of change

- [ ] Bug fix
- [ ] Feature
- [ ] Refactor (no behavior change)
- [ ] Documentation
- [ ] CI / tooling
- [ ] Security hardening

## Security impact

- [ ] No credentials are added to the frontend, environment files, or logs.
- [ ] Only the Supabase publishable/anon key is used — no service-role or secret keys.
- [ ] No secrets appear in the built bundle (verify with the CI bundle scan).
- [ ] Transaction success is determined by chain confirmation, not wallet signature.
- [ ] No floating-point arithmetic is used for money.
- [ ] No invented balances, returns, or statistics are displayed.

Describe any change to what the user is asked to sign, or to how a transaction's status is
reported:

<!-- ... -->

## Database / migration impact

- [ ] No database or migration changes.
- [ ] Database or migration changes included (see `susu-api` / `susu-indexer`).
      - [ ] RLS is preserved and never silently disabled.

## Testing

- [ ] New or updated tests cover the change, including negative paths.
- [ ] `format`, `lint`, `typecheck`, `test`, `build` pass.

## Accessibility

- [ ] Interactive elements are keyboard reachable.
- [ ] Loading, empty, pending, success, and failure states are represented.

## Checklist

- [ ] Docs updated to match the implementation.
- [ ] No claims of being audited, secure, or production-ready were added.
