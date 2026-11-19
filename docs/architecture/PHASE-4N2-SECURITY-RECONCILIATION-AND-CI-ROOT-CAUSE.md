# Phase 4N.2 — Security Reconciliation and CI Root-Cause Report

**Status:** READ-ONLY EVIDENCE REVIEW COMPLETE; REMEDIATION NOT IMPLEMENTED  
**Repository:** `msdshopfinds12-spec/infiniteX-5626f61e`  
**Inspected source branch:** `ci/phase-4m5c-security-regression-coverage`  
**Inspected commit:** `f8317c9c0c7074f2ccc7d9c08b82146ec82a06ef`  
**Supabase project:** `vepacoemkhudamfaccah` (Ashaa-INX)  
**Parent documentation branch:** `docs/phase-4n1-live-backend-verification`  
**Inspection mode:** GitHub source, workflow, job-log and deployed Edge Function source inspection. No code, database, secret, configuration or deployment writes.

> This document is a remediation plan and evidence ledger. It does not claim that any fix has been applied, tested, deployed, or released.

## 1. Executive decision

The engineering branch contains substantial security and quality controls, and multiple CI stages have passed. However, the inspected commit did not pass all required release gates.

Three actionable areas are evidenced:

1. **Dependency audit gate:** five high-severity findings were reported in the inspected CI output, including an advisory associated with the locked `picomatch@4.0.7` dependency path. The automated force-fix suggestion included a Vite major-version downgrade and must not be applied blindly.
2. **Accessibility gate:** Axe reported color-contrast failures in the light theme, with measured ratios below the 4.5:1 threshold for normal text.
3. **Deployed Edge Function drift:** all three deployed function sources differ from the corresponding tracked GitHub sources. The deployed implementations omit newer request-boundary and/or ownership-defense helpers present in the repository source.

These are release-blocking reconciliation tasks. They do not establish a security breach, successful exploitation, or the cause of every Vercel status failure.

**Recommended order:** fix dependency governance and accessibility in a focused application-code PR; prepare a separate Edge Function parity/deployment PR only after live configuration and database contracts are verified; investigate Vercel failures from their individual logs before changing deployment settings.

## 2. Scope, source and evidence

### 2.1 Repository source

- Repository: `msdshopfinds12-spec/infiniteX-5626f61e`
- Engineering branch: `ci/phase-4m5c-security-regression-coverage`
- Commit: `f8317c9c0c7074f2ccc7d9c08b82146ec82a06ef`
- Inspected source includes `package.json`, `package-lock.json`, frontend CSS, Edge Function source and shared security helpers.

### 2.2 CI workflow evidence

Three GitHub Actions workflow runs for the inspected commit were reviewed:

| Workflow area | Run ID | Observed outcome |
|---|---:|---|
| CI Security Regression | `44285236255` | Failed at dependency audit gate |
| Dependency Governance | `44285236620` | Failed at dependency security gate |
| Frontend CI | `44285236365` | Failed at accessibility and dependency audit gates |

The associated job logs were inspected. Passed stages included security source checks, CORS tests, worker-security tests, dependency policy tests, SBOM generation, type checking, 100 unit tests, production frontend build, and Deno worker tests. The failed stages must be rerun after remediation.

Run links:

- [CI Security Regression](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/44285236255)
- [Dependency Governance](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/44285236620)
- [Frontend CI](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/44285236365)

The report reflects those recorded runs only. It is not a claim about the current latest workflow state.

### 2.3 Deployed Edge Function evidence

Deployed function source was retrieved from the connected Supabase project and compared with the matching tracked source files on the engineering branch.

| Function | Deployed source | Repository source | Exact match |
|---|---:|---:|---|
| `ashaa-api-key-manager` | 5,307 chars / 109 lines | 5,750 chars / 111 lines | No |
| `simula-workflow-worker` | 10,380 chars / 293 lines | 11,332 chars / 308 lines | No |
| `simula-workflow-cron-worker` | 9,430 chars / 192 lines | 9,727 chars / 201 lines | No |

Deployed function records reported version 1 and ACTIVE status at inspection time. JWT verification metadata reported enabled for the API-key manager and regular workflow worker, and disabled for the cron worker. The cron worker uses a custom worker-secret verification contract. Do not change that JWT setting without validating the scheduler authentication path.

## 3. Finding D-01 — Dependency security audit

**Priority:** High — release gate  
**Status:** Verified CI audit failure; exact remediation not yet validated.

### Observed evidence

The inspected lockfile dependency path includes:

```text
vite@8.3.7
  -> tinyglobby@0.2.17
    -> fdir@6.5.0
      -> picomatch@4.0.7
```

The workflow audit reported five high-severity findings and zero critical findings in the inspected output. The output identified the advisory:

- [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf)

The automated force-fix recommendation included a Vite downgrade to 6.2.7. That is a potentially breaking major-version change and is not an acceptable default remediation.

### Root-cause assessment

The CI release gate is correctly blocking a dependency tree that the configured audit policy considers unacceptable. The exact set of five findings must be re-confirmed against the post-remediation lockfile because advisories and transitive dependency resolution can change.

### Preferred remediation

1. Reproduce the exact audit using the repository's pinned Node/npm versions and lockfile.
2. Run `npm audit --json` and preserve the machine-readable output as a CI artifact.
3. For each advisory, record package, installed version, affected range, patched version, dependency path, severity, and whether it is reachable in production.
4. Identify the narrowest compatible patched transitive dependency resolution.
5. Prefer a compatible upstream package update or supported npm override over a forced Vite downgrade.
6. Regenerate `package-lock.json` with the repository's pinned npm version.
7. Inspect the lockfile diff and confirm no unrelated package churn.
8. Run the complete regression matrix before proposing merge.

### Safe command sequence for a future code branch

```bash
node --version
npm --version
npm ci
npm audit --json > npm-audit-before.json
npm ls vite @vitejs/plugin-react tinyglobby fdir picomatch
```

After selecting and reviewing the patched version:

```bash
npm install --package-lock-only
npm ci
npm audit --json > npm-audit-after.json
npm ls vite @vitejs/plugin-react tinyglobby fdir picomatch
npm run typecheck
npm test
npm run build
```

The exact package change is intentionally not prescribed here until the advisory's affected and patched ranges are checked against the live registry metadata and the project's compatibility matrix.

### Rejected shortcut

Do not run `npm audit fix --force` as an unreviewed one-line fix. It may introduce a major downgrade, change build semantics, or create additional regressions while hiding the original dependency-path decision.

### Acceptance criteria

- No unresolved critical or high findings under the project's approved audit policy, or an explicit, time-bounded, documented exception approved by the responsible maintainer.
- Lockfile is reproducible with `npm ci`.
- Vite, React plugin, TypeScript, and build toolchain remain compatible.
- Unit tests, typecheck, build, and frontend E2E tests pass.
- SBOM and audit artifacts are generated from the exact candidate commit.

## 4. Finding A-01 — Light-theme WCAG contrast failures

**Priority:** High — accessibility release gate  
**Status:** Verified from inspected Axe workflow output; source token remediation not applied.

### Observed failing pairs

| Foreground | Background | Measured contrast | Normal-text target |
|---|---|---:|---:|
| `#2e65e1` | `#e5edfd` | 4.39:1 | 4.5:1 |
| `#3973e6` | `#e4edfd` | 3.73:1 | 4.5:1 |
| `#738090` | `#ffffff` | 4.02:1 | 4.5:1 |

The failures are associated with light-theme navigation/text styling in the inspected frontend. Do not assume every occurrence of a color token has the same background or semantic role.

### Preferred remediation

1. Inventory semantic CSS variables and component-specific overrides.
2. Identify the actual computed foreground/background pair for each failing element.
3. Adjust semantic tokens rather than applying arbitrary global filters or opacity changes.
4. Preserve brand hue where possible; darken text/interactive foreground or adjust surface tint as appropriate.
5. Validate normal text at 4.5:1 or greater; large text may use the applicable 3:1 threshold.
6. Validate non-text UI component boundaries and focus indicators against the relevant WCAG criteria.
7. Run Axe in light and dark themes and inspect keyboard/focus states.

### Design constraints

- Do not fix contrast by removing visual hierarchy or making all elements the same color.
- Do not rely on color alone to convey status.
- Preserve visible focus indicators.
- Respect reduced-motion preferences.
- Keep text readable at mobile viewport widths and Android browser zoom.

### Acceptance criteria

- No serious/critical Axe contrast violations in supported themes.
- Color-token unit tests or a documented contrast-check script cover the semantic palette.
- Keyboard navigation and focus states remain visible.
- Visual regression review confirms the modern InfiniteX design remains coherent.

## 5. Finding E-01 — Deployed Edge Function source drift

**Priority:** Critical reconciliation gate  
**Status:** Three source mismatches verified; no production deployment performed.

### 5.1 API-key manager

Deployed source uses wildcard CORS behavior and does not use the repository version's shared bounded request-body reader.

Repository source includes stricter origin handling and `readJsonBodyLimited(req, 2048)`, which enforces a byte limit while reading the stream rather than trusting only the declared Content-Length.

**Remediation requirements:**

- Confirm the exact production frontend origins and any required local development origins.
- Ensure preflight and actual responses use the same origin policy.
- Reject unapproved origins without reflecting arbitrary Origin headers.
- Enforce actual streamed body bytes, including when Content-Length is missing or misleading.
- Preserve bearer authentication and service-side authorization.
- Ensure the API key is returned only at creation time and never returned from listing or logging paths.
- Never log raw keys, bearer tokens, or stored verifier material.

### 5.2 Regular workflow worker

Deployed source does not contain the same newer shared ownership-validation and bounded body-reader helpers present in the repository version.

The live database claim RPC includes an authenticated owner filter, which is a positive control. However, the worker's application-layer defense-in-depth implementation differs from the reviewed branch.

**Remediation requirements:**

- Revalidate the claimed run's owner and workflow relationship before executing any step.
- Treat every client-supplied run/workflow/user ID as untrusted.
- Enforce bounded actual request-body reads.
- Clamp requested batch limits server-side.
- Validate status transitions and idempotency.
- Ensure retries cannot execute the same non-idempotent action twice without an explicit idempotency contract.
- Keep service-role credentials inside the trusted server runtime.

### 5.3 Cron worker

Deployed source uses Content-Length-based size checks. Repository source uses the shared stream reader and additional ownership helpers.

The deployed cron worker has JWT verification disabled and follows a custom worker-secret verification path. This is not automatically a defect: scheduled service-to-service workers may intentionally use a separate secret-authentication contract. Its safety depends on secret handling, request verification, replay resistance, and the scheduler configuration.

**Remediation requirements:**

- Verify the worker secret is never exposed to the browser or returned in logs.
- Validate secret comparison and reject missing/invalid values.
- Consider timestamp/nonce or another replay defense where compatible with the scheduler.
- Enforce actual streamed body limits.
- Validate every claimed run/workflow association.
- Keep cron's global queue claim restricted to service-role execution.
- Confirm the schedule's HTTP invocation and retry behavior from logs, without manually triggering production work.

### 5.4 Deployment reconciliation plan

Do not deploy the current branch source blindly. The safe process is:

1. Retrieve exact deployed and candidate source into a reviewable diff.
2. Review all environment-variable names and required configuration without reading secret values.
3. Confirm the live database RPC signatures, grants, and return shapes.
4. Confirm CORS origins and scheduler authentication contract.
5. Run unit and integration tests against the exact candidate source.
6. Produce a per-function deployment manifest and rollback artifact.
7. Obtain explicit deployment approval.
8. Deploy one function at a time.
9. Verify deployment version/source hash and non-sensitive health evidence.
10. Observe logs and metrics before proceeding to the next function.

### Acceptance criteria

- Deployed source hash corresponds to the approved commit/artifact.
- No wildcard CORS for authenticated user-facing functions unless a documented, reviewed requirement justifies it.
- Actual request body limits enforced.
- Ownership validation is server-side and tested.
- Worker-secret path is tested without exposing secret values.
- No secrets or sensitive payloads appear in logs.
- Rollback source/configuration is available and verified.

## 6. Finding V-01 — Vercel deployment status failures

**Priority:** High — release investigation  
**Status:** Earlier status evidence reported six failing Vercel contexts; root cause not established in this Phase 4N.2 inspection.

A failed deployment status is not itself a root cause. Do not infer that it is caused by the GitHub integration 403, environment variables, build configuration, or application code without the individual deployment logs.

### Investigation sequence

1. Identify each failed Vercel deployment/status context and its deployment ID.
2. Read its build log and deployment metadata.
3. Separate GitHub checkout/integration errors from install, build, environment, and deployment errors.
4. Compare the failed deployment's commit SHA with the intended source commit.
5. Verify project root, framework preset, install command, build command, output directory, and Node runtime.
6. Inspect environment-variable names and presence metadata only; never print secret values.
7. Reproduce the build locally or in CI with the same Node/package manager versions.
8. Propose the smallest configuration change and a rollback plan.

**Not verified in this report:** the individual Vercel deployment log root causes. No Vercel settings or deployments were modified.

## 7. Cross-cutting test and security strategy

### 7.1 Dependency tests

- Clean install from lockfile.
- Audit JSON artifact and policy gate.
- SBOM generation.
- Dependency path and override review.
- Build and test against the exact lockfile.

### 7.2 CORS and request-boundary tests

| Test case | Expected result |
|---|---|
| Approved Origin | Correct allow-origin response |
| Unapproved Origin | No permissive origin reflection |
| Missing Origin where allowed | Explicit documented behavior |
| OPTIONS preflight | Correct methods/headers and no side effects |
| Missing Content-Length with oversized stream | Rejected |
| Misleading small Content-Length with oversized stream | Rejected |
| Malformed JSON | Safe 4xx response |
| Empty body where required | Safe 4xx response |
| Oversized JSON body | Rejected before expensive processing |

### 7.3 Ownership and workflow tests

Use synthetic User A and User B identities:

- User A cannot read or claim User B's workflow.
- User A cannot execute a run whose workflow belongs to User B.
- Body-supplied owner ID cannot override verified identity.
- Invalid run/workflow relationship is rejected.
- Batch size below/above supported bounds is clamped or rejected as specified.
- Concurrent claims do not return the same run to two workers.
- Retry behavior is idempotent.
- Service-role-only RPCs reject ordinary authenticated users.

### 7.4 API-key tests

- Creation returns the raw key only once.
- Database stores only a one-way verifier/hash.
- List/detail responses never include `key_hash`.
- Authenticated users cannot select another user's key.
- Key revocation takes effect on the server-side validation path.
- Logs contain no raw key, hash, bearer token, or secret.

### 7.5 Accessibility tests

- Light and dark theme Axe runs.
- Normal text contrast at least 4.5:1.
- Large text contrast follows applicable 3:1 criterion.
- Keyboard-only navigation.
- Visible focus and selected states.
- Semantic landmarks and accessible names.
- Reduced-motion behavior.
- Mobile layout and zoom testing.

## 8. Recommended implementation split

Avoid one giant "fix everything" commit. Split by blast radius and rollback boundaries.

| Proposed workstream | Files/scope | Risk | Required gate |
|---|---|---|---|
| PR A — Dependency remediation | package manifests and lockfile | Medium | Full CI + audit |
| PR B — Accessibility tokens | semantic CSS tokens and affected components | Low/Medium | Axe + visual review |
| PR C — Worker parity | shared helpers and three Edge Function sources | High | Security + integration tests |
| PR D — API-key grants | SQL migration and API-key response contract | High | DB approval + two-user tests |
| PR E — Vercel diagnosis | project configuration only if logs prove need | Medium/High | Exact root cause + rollback |

Do not combine database permission changes with Edge Function deployment unless the dependency between them is explicitly documented and tested.

## 9. Free-first, low-risk alternatives

1. Reuse the existing Node, npm, Vitest/Playwright, Deno and GitHub Actions setup before adding new paid tooling.
2. Use GitHub Actions artifacts for audit JSON, SBOM, test reports and build outputs.
3. Use synthetic test data and isolated test users; do not use real customer data for regression testing.
4. Prefer static analysis and deterministic tests before live integration tests.
5. Keep AI provider calls disabled in CI unless a mock adapter is used. Do not introduce paid model usage into routine tests.
6. Use an explicit provider adapter interface so a free/local/mock test implementation can be swapped without changing business logic.
7. Keep scheduled worker verification read-only where possible; do not trigger production queue work merely to test it.
8. Verify service free-tier limits before relying on production scheduling, storage, egress or invocation volume.

"Free" does not mean unlimited. Record quotas, retention, and expected usage before enabling new workloads.

## 10. Proposed architecture hardening

### Client boundary

React + TypeScript + Vite is an untrusted client. It may hold a user session token but must not contain service-role credentials, worker secrets, AI provider keys, or privileged administrative capabilities.

### Trusted application boundary

Supabase Edge Functions are the trusted boundary for privileged actions. Every handler should:

- Authenticate the caller using a supported verification path.
- Derive the user identity from verified claims.
- Validate request schema and byte size.
- Enforce authorization on every object access.
- Apply rate/quota and idempotency controls.
- Return a narrow versioned response schema.
- Emit redacted audit events.

### Data boundary

PostgreSQL RLS and constraints enforce user-owned data isolation. Service-role paths must be explicitly reviewed because service-role access bypasses ordinary RLS enforcement.

### AI execution boundary

AI provider credentials remain server-side. The execution service must apply model allowlists, per-user quotas, request/output limits, approval gates for consequential actions, timeouts, retry budgets, and durable audit records. No provider-connected execution is considered verified until integration tests demonstrate it.

## 11. Release gate checklist

A candidate remediation is not ready for release until all applicable items are true:

- [ ] Exact candidate commit and source tree recorded.
- [ ] Dependency audit rerun against the candidate lockfile.
- [ ] No unapproved critical/high dependency findings.
- [ ] SBOM generated from the candidate.
- [ ] Typecheck passes.
- [ ] Unit tests pass.
- [ ] Frontend build passes.
- [ ] Deno/Edge Function tests pass.
- [ ] CORS and body-limit tests pass.
- [ ] Two-user ownership isolation tests pass.
- [ ] Axe accessibility tests pass in light and dark themes.
- [ ] Vercel deployment root cause understood and verified.
- [ ] Deployment artifact/source hash matches approved commit.
- [ ] Rollback procedure documented and usable.
- [ ] Human release approval recorded.

## 12. Change boundary and audit statement

This Phase 4N.2 operation is documentation-only.

No application code, package manifest, lockfile, CSS, SQL migration, table data, RLS policy, grant, secret, Edge Function, cron job, Vercel project setting, deployment, PR merge, or billing configuration was modified.

The following remain separately gated:

- Package or lockfile updates.
- CSS/component changes.
- SQL, DDL, DML, grant/revoke, or data migration.
- Secret creation, retrieval, rotation, or modification.
- Edge Function source/configuration deployment.
- Cron schedule changes or production workflow triggering.
- Vercel settings/deployment changes.
- PR merges, branch deletion, releases, or public publishing.
- Any action that can incur new charges.

## 13. Next execution plan

After review of this document, the recommended next work is a **code-only remediation branch** beginning with the two lower-blast-radius CI failures:

1. Dependency remediation with a narrowly scoped lockfile diff.
2. Light-theme semantic token correction.
3. Run the complete CI matrix and attach evidence.
4. Only after those pass, prepare Edge Function parity in a separate high-risk branch.
5. Treat database grants and production deployment as independent approval gates.

Suggested next branch after this documentation PR:

`fix/phase-4n2-ci-accessibility-dependencies`

Do not create that code branch or modify files until the implementation scope and approval are explicitly confirmed.

**Final status:** Phase 4N.2 evidence and remediation plan documented; fixes NOT IMPLEMENTED; tests NOT rerun after fixes; production release NOT APPROVED.
