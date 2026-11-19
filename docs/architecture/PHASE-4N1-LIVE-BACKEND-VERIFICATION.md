# Phase 4N.1 — Live Backend Verification and Deployment Drift Report

**Status:** READ-ONLY LIVE BACKEND INSPECTION COMPLETED; SECURITY REMEDIATION AND END-TO-END RUNTIME TESTS NOT PERFORMED  
**Repository:** `msdshopfinds12-spec/infiniteX-5626f61e`  
**Repository source baseline:** `ci/phase-4m5c-security-regression-coverage`  
**Architecture baseline:** `docs/phase-4n-architecture-baseline` (PR #29; draft, unmerged at time of inspection)  
**Supabase project reference:** `vepacoemkhudamfaccah` (Ashaa-INX)  
**Inspection mode:** Read-only GitHub and Supabase inspection; catalog SELECT queries and metadata/source retrieval only.  
**Change boundary:** This report documents observed state. It does not authorize or perform migrations, DDL, grants, secret reads/changes, function updates, deployments, PR merges, or paid-plan changes.

## 1. Executive summary

Phase 4N.1 materially updates the source-only architecture baseline with live Supabase evidence.

The connected Supabase project reports healthy project status and PostgreSQL 17. Read-only database catalog inspection returned:

- 14 application tables in the `public` schema.
- RLS enabled on all 14 tables.
- 19 policies across 13 of those tables.
- 19 recorded Supabase migration entries.
- Three deployed Edge Functions corresponding to the API-key manager, workflow worker, and cron worker.
- Two active Supabase cron jobs associated with workflow scheduling/processing.

The deployed Edge Function source was compared with the corresponding source files on the inspected GitHub engineering branch. All three compared function sources differ. The deployed versions are shorter than the repository versions and do not contain the same newer shared security/request-boundary implementation. This is a source/deployment drift finding, not proof of compromise or proof that every omitted line is security-critical.

**Strategic decision:** retain Supabase as the canonical near-term identity, database, and serverless application boundary. Do not activate the separate Node API as a second production backend until a deliberate architecture decision and contract migration plan exists.

**Production readiness remains NOT ESTABLISHED.** Catalog inspection and source comparison do not prove a complete authenticated frontend-to-database workflow, successful scheduled execution, provider-connected AI execution, or passing cross-tenant runtime tests.

## 2. Evidence scope and method

### 2.1 GitHub source inspected

- Repository: `msdshopfinds12-spec/infiniteX-5626f61e`
- Engineering source branch: `ci/phase-4m5c-security-regression-coverage`
- Architecture baseline branch: `docs/phase-4n-architecture-baseline`
- PR #29: draft, open, unmerged at time of inspection.
- Architecture baseline file: `docs/architecture/PHASE-4N-REPOSITORY-ARCHITECTURE-BASELINE.md`

The prior Phase 4N baseline records a 130-file recursive tree for its inspected engineering-branch snapshot. That count is specific to that snapshot and is not a live database metric.

### 2.2 Supabase read-only checks

The inspection used project metadata, migration metadata, deployed Edge Function metadata/source, and read-only PostgreSQL catalog queries for:

- `pg_class` and `pg_namespace` — application relations and RLS flags.
- `pg_policies` — row-level policy definitions.
- `pg_proc`, `pg_roles`, and privilege checks — RPC definitions, owners, security-definer flags and execute access.
- `information_schema.columns` and privilege views — column contracts and grants.
- `cron.job` — matching scheduled jobs.

No DDL, DML, grant/revoke, secret, function deployment, or configuration mutation was performed.

### 2.3 Evidence limitations

- This report records the result of the connected project at inspection time; it is not a continuous monitor.
- The project reference is recorded, but credentials, secret values, and sensitive configuration values are intentionally excluded.
- Catalog visibility and connector permissions may limit what can be observed.
- A function being listed as deployed does not establish that its last invocation succeeded.
- A cron job being active establishes schedule configuration, not successful job execution.
- Source character-count differences are a drift indicator, not a semantic proof by themselves. The actual source comparison identified differing lines and missing newer helper usage.

## 3. Live database inventory

### 3.1 Public application tables

All 14 listed public application tables had RLS enabled and `FORCE ROW LEVEL SECURITY` disabled at inspection time.

| Table | RLS | FORCE RLS |
|---|---:|---:|
| `billing_webhook_events` | Enabled | No |
| `credit_ledger` | Enabled | No |
| `payments` | Enabled | No |
| `platform_api_keys` | Enabled | No |
| `profiles` | Enabled | No |
| `subscriptions` | Enabled | No |
| `tools` | Enabled | No |
| `usage_logs` | Enabled | No |
| `user_projects` | Enabled | No |
| `workflow_logs` | Enabled | No |
| `workflow_runs` | Enabled | No |
| `workflow_step_runs` | Enabled | No |
| `workflow_steps` | Enabled | No |
| `workflows` | Enabled | No |

RLS enabled does not, by itself, prove safe access. Policy predicates, table grants, views, RPC execution privileges, service-role call paths, and actual cross-user behavior must all be evaluated together.

### 3.2 Policy inventory

The catalog query returned 19 public-schema policies spanning 13 tables:

- `credit_ledger`
- `payments`
- `platform_api_keys`
- `profiles`
- `subscriptions`
- `tools`
- `usage_logs`
- `user_projects`
- `workflow_logs`
- `workflow_runs`
- `workflow_step_runs`
- `workflow_steps`
- `workflows`

`billing_webhook_events` had RLS enabled but did not appear in the returned public policy-table list. This is consistent with a deny-by-default posture for roles without an applicable policy, but intended access must be confirmed against its service-side processing path and grants. Do not add a broad policy merely to make the table accessible.

### 3.3 Migration history

Supabase migration metadata returned 19 recorded migration entries.

Important distinction:

- The inspected GitHub engineering tree did not contain tracked SQL migration/schema files in the earlier recursive-tree audit.
- The connected Supabase project does have recorded migration history and an existing live schema.
- These are different sources of truth and must be reconciled. Do not generate a replacement schema from assumptions or replay remote migrations blindly.

Required follow-up: export or retrieve the migration version/name ledger and compare it against the repository's migration directory after the repository history is inspected. A migration count alone does not establish that the local source files are complete or that the remote schema is identical to a clean replay.

## 4. Authentication, ownership and RPC security

### 4.1 Observed security controls

Read-only catalog and privilege inspection confirmed the existence of worker-related RPCs:

- `simula_verify_worker_secret`
- `simula_claim_workflow_runs`
- `simula_claim_workflow_runs_internal`

The inspected privilege metadata showed the internal queue-claim and worker-secret verification operations restricted to the service-role execution path, rather than generally executable by `anon` or `authenticated`.

The user-scoped claim path derives its identity from the authenticated database context. This is an important trust boundary: ownership must not be accepted from an arbitrary request-body user ID.

The inspected database also contains ownership policies for user profiles/projects, workflows, workflow runs/steps/logs, and API-key records. Exact behavior still requires runtime tests using at least two synthetic users and two separate workspaces.

### 4.2 Profile role protection

The catalog privilege check did not show authenticated users having UPDATE permission on the `profiles.role` column. This is a useful defense against self-service privilege escalation.

Keep role assignment and administrative role changes behind a trusted server-side path. Never trust a client-supplied role, owner ID, workspace ID, or service-role claim.

### 4.3 API-key hash exposure — hardening candidate

The `platform_api_keys` table's authenticated SELECT grant includes the `key_hash` column. RLS limits rows according to the applicable policy, but a user able to select their own key record may also be able to read its stored hash.

The existing API-key Edge Function listing path is preferable because it can return a narrow response that excludes the hash.

**Recommended remediation proposal (not applied):**

1. Confirm whether direct client SELECT on `platform_api_keys` is needed at all.
2. Prefer revoking broad table SELECT from `authenticated` and exposing only a narrow server-side response, or use column-level grants that exclude `key_hash`.
3. Preserve owner scoping in every server-side operation.
4. Verify that the API-key manager never returns stored hashes.
5. Add tests proving that an authenticated client cannot select the hash, another user's key, or administrative metadata.
6. Review service-role and function-owner paths separately; service-role access bypasses ordinary RLS behavior.

This is a least-privilege hardening recommendation, not a claim that raw API keys are currently retrievable. A one-way hash is not the raw key, but it is still sensitive verifier material and should not be unnecessarily exposed.

### 4.4 FORCE RLS

All 14 public application tables had RLS enabled but not FORCE RLS.

Do not mechanically enable FORCE RLS across all tables. Table owners and privileged server paths may rely on owner bypass behavior. First map table owners, service-role operations, security-definer functions, and migration behavior. Then evaluate FORCE RLS table-by-table with regression tests.

## 5. Deployed Edge Function inventory and source drift

### 5.1 Deployed functions observed

The connected Supabase project returned deployed function records for:

- `ashaa-api-key-manager`
- `simula-workflow-worker`
- `simula-workflow-cron-worker`

This confirms function records and retrievable deployed source metadata. It does not establish successful live requests or successful workflow completion.

### 5.2 GitHub/deployed source comparison

Each deployed `index.ts` was compared against its matching file in `ci/phase-4m5c-security-regression-coverage`.

| Function | Deployed source size | GitHub source size | Comparison |
|---|---:|---:|---|
| `ashaa-api-key-manager` | 5,307 chars | 5,750 chars | Different |
| `simula-workflow-worker` | 10,380 chars | 11,332 chars | Different |
| `simula-workflow-cron-worker` | 9,430 chars | 9,727 chars | Different |

The compared files differ line-by-line; these are not exact source matches.

Observed examples of implementation drift:

- The deployed API-key manager uses wildcard CORS behavior and does not use the repository version's bounded request-body parsing helper.
- The deployed regular workflow worker does not contain the same newer shared ownership-validation and bounded request-body helper implementation.
- The deployed cron worker relies on Content-Length-based request-size checks rather than the repository version's actual request-stream byte limit.

The repository contains shared worker-security helpers and regression tests for these boundaries. Their presence in GitHub does not mean they are deployed.

### 5.3 Drift risk

The current state creates a split-brain maintenance risk:

- GitHub source may be reviewed and tested while production continues running different source.
- A future fix to only one worker path can leave the cron worker or regular worker with different security behavior.
- Operational debugging becomes harder because the deployed implementation does not match the reviewed commit.
- Security regression tests against repository source cannot validate a different deployed artifact.

**Required remediation approach:** perform a controlled, function-by-function reconciliation after validating configuration, required environment variables/secrets by name (never values), database RPC compatibility, CORS origins, and regression coverage. Deploy one function at a time only under a separate explicit deployment approval.

Do not blindly overwrite live functions with the current branch source. First inspect the exact diff and prove compatibility with the live database contracts.

## 6. Workflow scheduler observations

Two active cron jobs matched the Simula workflow scheduling/processing path:

| Job | Schedule | Active |
|---|---|---:|
| `simula-enqueue-due-workflows` | `* * * * *` | Yes |
| `simula-workflow-cron-worker-every-minute` | `* * * * *` | Yes |

Both are configured for once-per-minute scheduling.

**Not verified:** successful cron invocation, successful Edge Function HTTP response, queue claim count, workflow completion, retry behavior, dead-letter behavior, or alerting. Those require read-only logs/metrics inspection and controlled synthetic integration tests. Do not trigger production jobs merely to test them.

## 7. Canonical architecture decision

### 7.1 Recommended near-term system of record

Use Supabase as the canonical near-term backend:

- Supabase Auth — identity and verified user claims.
- PostgreSQL — canonical application data.
- RLS and database constraints — tenant/data isolation.
- Supabase Edge Functions — trusted API/application boundary.
- Supabase Vault or managed secret configuration — server-side secret storage.
- Durable database records — workflow state, usage, and audit history.

Keep the React + TypeScript + Vite application as the client. The client must not hold service-role credentials, provider API secrets, worker secrets, or unrestricted tool execution privileges.

### 7.2 Node API alternative

Keep `apps/api` as an isolated, non-production foundation for now. Its authentication/session and workspace authorization primitives may be useful if a separately hosted Node runtime becomes a justified requirement.

Do not simultaneously implement duplicate identity, session, workspace, workflow, and billing systems in both Node and Supabase.

A later Node-centered architecture is possible, but it would require a deliberate migration plan that defines which system owns identity, transactions, authorization, and workflow execution. It is not the recommended first implementation path because Supabase already has a live schema, Auth integration, Edge Function records, and scheduled workflow infrastructure.

### 7.3 Target request flow

```text
React + TypeScript + Vite
  |
  | Supabase Auth access token; no privileged secrets
  v
Supabase Edge Function
  |
  +--> Verify token with Supabase Auth
  |
  +--> Resolve user/workspace authorization server-side
  |
  +--> Validate request schema, size, rate and idempotency
  |
  +--> Execute least-privilege application operation
  |
  +--> Write durable audit/workflow state
  v
PostgreSQL + RLS + constraints
  |
  +--> workflow queue / usage / audit
  v
Trusted worker / approved AI provider adapter
```

Workspace membership is a target contract, not a verified existing table. The live table inventory did not show a dedicated `workspace_memberships` table. Do not implement workspace-scoped UI or claim multi-tenant workspace support until the intended workspace model is designed and verified.

## 8. Critical remediation register

| Priority | Finding | Safe next action | Gate |
|---|---|---|---|
| P0 | Deployed Edge Function source differs from reviewed GitHub source | Produce exact semantic diff and deployment manifest | No deployment without approval |
| P0 | End-to-end authenticated user-to-dashboard path not proven | Implement one read-only authenticated vertical slice | Contract and cross-user tests |
| P0 | Workspace membership contract not present in observed table inventory | Decide whether user-owned projects are sufficient or a workspace model is required | Architecture approval |
| P1 | API-key hash column is selectable through authenticated table grant | Review and narrow direct client grants | SQL change approval |
| P1 | RLS is enabled but not forced | Review owners and privileged paths table-by-table | Regression proof |
| P1 | Cron schedules are active but execution outcomes not verified | Inspect logs and queue metrics read-only | No production trigger |
| P1 | Migration history exists remotely but SQL migration files were absent from inspected branch tree | Reconcile migration ledger and source history | No migration replay |
| P1 | Worker and cron implementations can drift | Share pure action logic or enforce parity tests | Behavior-preserving refactor |
| P2 | Frontend remains demo/sample-driven per source baseline | Integrate verified endpoints incrementally | API contract approval |
| P2 | AI orchestration has no verified complete provider-connected execution path | Add one server-only provider adapter after core auth/data path | Provider and budget approval |

## 9. First vertical slice implementation contract

The first implementation should be intentionally small and read-only:

**Goal:** authenticated user requests their own application profile and owned project/workflow summary, and the dashboard renders the result with explicit connected/error/loading states.

Required behavior:

1. Client obtains a Supabase Auth session through the supported client SDK.
2. Client sends the access token to a narrowly scoped Edge Function or uses RLS-protected direct reads where the policy and data contract explicitly permit it.
3. Server validates the token; never trust a user ID from request JSON.
4. Server derives user identity from the verified token.
5. Every query is scoped to that verified user and, if applicable, a server-resolved workspace membership.
6. Response uses a versioned, runtime-validated schema and excludes secrets, hashes, internal tokens, and service-only metadata.
7. Dashboard displays loading, empty, connected, stale, permission-denied, and retryable-error states.
8. Synthetic User A and User B tests prove neither user can read the other's private records.

Exit criteria:

- Valid session returns only the caller's permitted data.
- Missing/invalid/expired session is rejected.
- User A cannot read or mutate User B's records.
- Client-supplied owner IDs do not change authorization scope.
- API-key hashes and service-only fields are never returned.
- Error responses do not leak SQL, tokens, secrets, or stack traces.
- Contract tests and browser integration tests pass on the exact commit.

## 10. Free-first engineering policy

- Preserve the existing React, TypeScript, Vite, Node test runner, and Playwright stack where appropriate.
- Prefer existing dependencies and platform capabilities before adding frameworks.
- Use synthetic test identities and isolated test data.
- Confirm actual free-tier quotas before relying on scheduled jobs, function invocations, database size, storage, or egress.
- Never expose Supabase service-role keys or AI provider keys in Vite-prefixed environment variables or browser bundles.
- Keep provider execution disabled until server-side credentials, model allowlists, quotas, approval policies, output limits, and durable audit are implemented.
- Do not describe a free tier as unlimited or production-ready without measured capacity evidence.

## 11. Verification ledger

| Capability | Evidence status |
|---|---|
| Supabase project metadata and healthy status | VERIFIED at inspection time |
| PostgreSQL major version 17 | VERIFIED |
| 14 public application tables | VERIFIED |
| RLS enabled on all 14 tables | VERIFIED |
| 19 policies across 13 tables | VERIFIED |
| 19 migration metadata entries | VERIFIED |
| Three deployed Edge Function records/source retrieved | VERIFIED |
| Three deployed sources exactly match inspected GitHub source | FALSE — all three differ |
| Two matching cron jobs configured active | VERIFIED |
| Cron job successful execution | NOT VERIFIED |
| Profile role column protected from authenticated UPDATE grant | VERIFIED at catalog privilege level |
| Internal worker RPCs restricted to service-role execution | VERIFIED at catalog privilege level |
| API-key hash excluded from all authenticated access paths | NOT VERIFIED; direct column grant is a hardening concern |
| RLS cross-user isolation in actual requests | NOT TESTED |
| Workspace membership model | NOT VERIFIED; no dedicated table in observed public inventory |
| Complete frontend-to-backend vertical slice | NOT VERIFIED |
| Provider-connected AI execution | NOT VERIFIED |
| Android physical-device QA | NOT TESTED |
| Production readiness | NOT ESTABLISHED |

## 12. Change log and release boundaries

This Phase 4N.1 report is a documentation-only deliverable.

No application code, SQL schema, table data, RLS policy, grant, secret, Edge Function, cron job, Vercel deployment, billing setting, or production configuration was changed as part of the inspection.

The following actions remain separately gated and are not authorized by this report:

- SQL migrations, DDL, DML, grants/revokes, or data backfills.
- Secret creation, rotation, retrieval, or modification.
- Edge Function source/configuration deployment.
- Cron schedule changes or production workflow triggering.
- PR merges, branch deletion, release tagging, or production publishing.
- Paid service upgrades or any action that can incur new charges.

## 13. Next recommended action

Proceed with Phase 4N.2 as a **review-only security reconciliation plan**:

1. Retrieve exact live and repository function sources into a review diff.
2. Verify CORS allowlists and request-size handling against the deployed configuration.
3. Review API-key table grants and the function response contract.
4. Confirm worker RPC grants, ownership predicates, and Vault secret reference names without reading secret values.
5. Define one deployment candidate commit per function and a rollback procedure.
6. Add/confirm tests that target the exact candidate source.
7. Request separate explicit approval before any production SQL or Edge Function deployment.

**Release gate:** no production deployment until the exact candidate source, configuration, tests, rollback, and human approval are recorded.
