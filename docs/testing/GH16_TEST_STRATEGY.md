# GH-16 — Test Strategy and Quality Gates

**Status:** Proposed strategy; no tests are claimed to have run from this document.

## 1. Objectives

Prove correctness, authorization boundaries, resilience, accessibility, and frontend/backend contract compatibility. Record command, commit SHA, environment, exit code, and relevant logs for every test run.

## 2. Test pyramid

### Unit tests
- Domain rules and state transitions.
- Validation schemas.
- Authorization policy functions.
- Provider adapter error normalization.
- UI components and hooks.

### Integration tests
- API routes with test database.
- Session lifecycle.
- Workspace membership and RLS.
- Transaction rollback and constraints.
- Request validation and error handling.

### End-to-end tests
- Sign-in test flow using a non-production identity adapter.
- Workspace selection and isolation.
- Dashboard empty/loading/error states.
- Agent/task metadata CRUD where implemented.
- Responsive layout and keyboard navigation.

### Security tests
- Anonymous access denied.
- Cross-workspace access denied.
- Role escalation denied.
- CSRF rejected where relevant.
- Expired/revoked sessions rejected.
- Oversized and malformed inputs rejected.
- Sensitive values absent from logs and responses.

## 3. Baseline repository checks

First inspect actual package scripts. Do not assume commands exist. Candidate commands only:
```bash
npm ci
npm run typecheck --if-present
npm run lint --if-present
npm test -- --run
npm run build
```

If a script is absent, record it as **NOT CONFIGURED** rather than silently skipping it. If the project uses a different package manager or workspace layout, use the committed lockfile and documented scripts.

## 4. Test data

- Use synthetic identities and workspace records.
- Use separate workspaces for isolation tests.
- Never use real user data, production tokens, or production database credentials.
- Reset test state between test cases.
- Avoid shared mutable test state where it can create false positives.

## 5. Required acceptance matrix

| Area | Positive test | Negative/failure test |
|---|---|---|
| Health | Liveness returns expected status | Dependency outage does not leak internals |
| Validation | Valid request accepted | Malformed/oversized request rejected |
| Identity | Valid test identity accepted | Missing/expired identity rejected |
| Authorization | Member reads permitted resources | Cross-workspace and role escalation denied |
| Tasks | Valid transition succeeds | Invalid transition/conflict rejected |
| Providers | Valid response normalized | Timeout, malformed output, quota failure handled |
| UI data | Live data shown only after verified response | Demo/offline state never shown as live |
| Accessibility | Keyboard and labels work | Focus and contrast issues detected |

## 6. Frontend QA

- Mobile viewport baseline: 360 CSS px width.
- Tablet and desktop breakpoints.
- No horizontal overflow on primary screens.
- Visible focus indicators.
- Semantic headings and labels.
- Buttons have meaningful accessible names.
- Loading, empty, error, offline, and stale-data states.
- Reduced-motion preference respected.
- Touch targets and form validation reviewed.

## 7. Reliability checks

- API timeout behavior.
- Database unavailable behavior.
- Provider timeout and quota exhaustion.
- Safe retry semantics.
- Concurrent task updates.
- Duplicate request/idempotency behavior where implemented.
- Graceful shutdown without hanging async work.

## 8. CI requirements

A pull request should run:
1. Install from lockfile.
2. Formatting/lint checks if configured.
3. Type checking.
4. Unit tests.
5. Integration tests.
6. Production build.
7. Security/dependency checks.
8. Browser tests where infrastructure supports them.

Do not report a CI pass as proof of production correctness. Tie every result to the exact tested commit SHA.

## 9. Evidence record template

```text
Commit SHA:
Date/time:
Environment:
Command:
Exit code:
Passed / failed / skipped:
Failure summary:
Log/artifact URL:
Reviewer:
```

## 10. Completion criteria

A feature is not complete merely because code compiles. It must have:
- Acceptance criteria.
- Positive and negative tests.
- Authorization tests for protected data.
- UI loading/error/empty states.
- Documentation.
- Test evidence from the current commit.
- No unresolved critical/high defects without documented approval.
