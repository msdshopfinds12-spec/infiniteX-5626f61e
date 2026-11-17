# Phase 3C — Security and CI Hardening

## Scope

This branch starts from `feature/infiniteX-platform-integrations` at
`e9aa71555f85cf2311d9e4d8f29a311e924fc250`. It is isolated from the source
branch and does not merge or deploy anything.

## Changes

- Rate-limit identity keys now encode both JWT issuer and subject as a JSON tuple.
  This prevents unrelated identity providers with the same subject from sharing
  one in-memory bucket.
- Task list, read and cancellation queries now include explicit tenant predicates,
  in addition to the transaction-local PostgreSQL tenant context and RLS design.
- Repository tests assert tenant predicates and issuer/subject key isolation.
- API CI now runs on the integration branch and this Phase 3C branch, supports
  manual dispatch, and performs dependency audit, typecheck, tests and build.
- Workflow token permissions remain read-only (`contents: read`).

## Known limitations — do not overstate readiness

1. The API package currently has no committed `apps/api/package-lock.json`.
   The workflow uses `npm install` temporarily. Reproducible `npm ci` remains
   blocked until a reviewed lockfile is generated and committed.
2. The rate limiter remains process-local. It is suitable only as a bounded
   single-process guard, not a globally consistent multi-instance rate limiter.
   A shared atomic store is required before horizontal production scaling.
3. PostgreSQL RLS is defined in migration source, but this branch does not apply
   migrations. Actual database-role behavior and cross-tenant integration tests
   remain unverified.
4. Authentication verifies JWT signature, issuer, audience and RS256 algorithm.
   Resource authorization still depends on tenant-scoped repository operations.
5. No AI provider, external agent repository, worker, secret, paid service,
   production database or deployment is activated by this phase.

## Required verification

- [ ] GitHub Actions API CI passes on this exact branch head.
- [ ] API typecheck passes.
- [ ] API unit tests pass.
- [ ] API dependency audit has no high/critical production dependency findings.
- [ ] API production build passes.
- [ ] Disposable PostgreSQL cross-tenant integration tests are added before release.
- [ ] API package lockfile is committed before claiming reproducible installs.
- [ ] Shared rate-limit storage is selected before multi-instance deployment.

## Release policy

No migration, merge, production secret change, billing action or deployment is
authorized by this phase. Release requires a separate human approval after
security and QA evidence is reviewed.
