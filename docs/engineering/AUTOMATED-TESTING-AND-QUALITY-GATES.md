# Automated Testing & Quality Gates

## Test pyramid and ownership

| Layer | What it proves | Example for InfiniteX |
|---|---|---|
| Static checks | Syntax, types and policy patterns | TypeScript checks, lint, security source scanner |
| Unit | Pure logic and edge cases | Worker validation, batch limits, request byte limits |
| Integration | Components work together | Supabase adapters, RPC contracts, API handlers |
| Security integration | Authorization boundaries | Synthetic owner A/B cannot access each other's records |
| Concurrency | Race and retry behavior | Duplicate queue claims, idempotency, lease expiry |
| End-to-end | Critical user workflows | Sign-in, create workflow, run, view result |
| Accessibility | Usable interfaces | axe plus keyboard and manual assistive-tech review |
| Recovery | Safe restoration | Restore drill, rollback validation, replay safety |

## Required PR gates
- Reproducible dependency install using the lockfile.
- Format/lint and static policy checks.
- Typecheck.
- Unit tests.
- Integration/security tests appropriate to the changed code.
- Browser tests for user-facing changes.
- Accessibility tests for changed UI.
- Dependency audit and secret scanning.
- Production build.
- Deno test/typecheck for Supabase Edge Functions.
- Review of changed workflow permissions and third-party action pins.

## Test data and isolation
- Use synthetic identities and records.
- Separate test project/environment from production.
- Never run destructive integration tests against production.
- Use unique test identifiers and deterministic cleanup.
- Do not place service-role keys or user credentials in browser tests.
- Verify both allowed and denied access paths.

## Flaky test policy
- Do not hide failures with broad retries or continue-on-error.
- Retry only known transient infrastructure failures, with bounded attempts and logging.
- Track flake rate and owner.
- Quarantine only with an issue, expiry date and compensating gate.
- A rerun passing does not erase the initial failure; record both.

## Evidence contract
Every test report records repository, branch, exact commit SHA, workflow run, job, command, environment, result and known exclusions. A green run on an earlier commit does not validate a newer commit.

## Release acceptance
All required checks pass on the exact candidate SHA; review is complete; no unresolved critical/high security finding; rollback and operational readiness are reviewed; release approval is recorded.
