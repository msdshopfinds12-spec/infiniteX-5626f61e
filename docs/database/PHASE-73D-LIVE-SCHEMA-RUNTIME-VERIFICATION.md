# Phase 73D — Live Schema and Runtime Verification

**Project:** Ashaa-INX (`vepacoemkhudamfaccah`)  
**Capture timestamp:** 2026-11-20T21:23:08.641352Z (database catalog query)  
**Database:** PostgreSQL 17.11.0.003  
**Mode:** Read-only Supabase metadata and deployed Edge Function source inspection  
**Repository comparison ref:** `phase-71/worker-http-integration` at `94253f7bf0c5bbfb4d663696fcbf9ab077af7088`  
**Status:** PARTIAL — high-value live evidence captured; runtime parity and API-key grant hardening remain unresolved.

## 1. Executive summary

The live project is healthy and contains the expected 14 public application tables. Its live migration ledger contains 19 entries, matching the 19 version/name entries in the recovered repository manifest.

The strongest finding is **deployed Edge Function drift**: all three active deployed functions differ from the selected GitHub candidate source. In particular, the deployed workflow workers do not contain the candidate's attempt-generation fencing. The deployed API-key manager also lacks the candidate's exact-origin CORS adapter and bounded JSON-body parser.

The live catalog additionally confirms that the API-key column-access hardening migration is not applied. Authenticated users currently have table-wide SELECT on `public.platform_api_keys`, including SELECT on `key_hash`; owner-scoped RLS still limits rows. The hash is not the raw API key, but this is unnecessary exposure and the existing least-privilege candidate addresses it.

No production objects were modified.

## 2. Live project inventory

| Observation | Live result |
|---|---|
| Project status | `ACTIVE_HEALTHY` |
| PostgreSQL | 17.11.0.003 |
| Public application tables | 14 |
| Tables returned across inspected schemas | 58 |
| Applied project migrations | 19 |
| Recovered manifest migrations | 19 |
| Installed extensions relevant to this system | `pg_net`, `pg_cron`, `pgcrypto`, `supabase_vault` |
| Active Edge Functions | 3 |
| Health advisor lints | 0 |

The 19 live migration version/name pairs match the recovered manifest. This verifies ledger inventory parity at capture time; it does not prove historical original Git blob equivalence for the recovered SQL files.

## 3. Security and permissions findings

### SEC-73D-01 — API-key table grants are broader than the candidate contract

**Observed live facts:**

- `public.platform_api_keys` has RLS enabled.
- Owner-scoped SELECT and UPDATE policies exist.
- `authenticated` has table-level SELECT.
- Effective privilege checks confirm `authenticated` can SELECT `key_hash`.
- `authenticated` has no table-wide UPDATE, but can UPDATE `revoked_at`.
- `service_role` has the expected server-side table privileges.
- Live migration ledger does not contain version `20261120120000`.

The repository candidate `supabase/migrations/20261120120000_harden_platform_api_key_column_access.sql` revokes table-wide SELECT and grants only safe metadata columns, while retaining the narrow `revoked_at` update.

**Assessment:** MEDIUM — least-privilege gap, not proof of raw API-key disclosure. The stored value is a SHA-256 digest of a high-entropy generated key, not the raw credential. Owner RLS remains active. The candidate migration is **confirmed not applied** at capture time.

**Recommendation:** retain the candidate as a separate reviewed migration. Before any application, rehearse against a disposable PostgreSQL 17 database, verify PostgREST selects and API-key manager behavior, run security advisors, and require explicit production approval. Do not execute it as part of this audit.

### SEC-73D-02 — Billing webhook table has RLS but no policies

**Observed live facts:**

- `public.billing_webhook_events` has RLS enabled and zero policies.
- Effective grants show no SELECT or INSERT for `anon` or `authenticated`.
- `service_role` has server-side access.
- Supabase Security Advisor reports `rls_enabled_no_policy` at INFO.

**Assessment:** currently consistent with a private service-role-only ingestion table. The absence of client policies is not by itself a vulnerability when client roles have no table grants and the intended access is server-only.

**Recommendation:** document this as intentional, keep client grants absent, and add regression checks so future grants do not silently expose webhook event data. Do not add an authenticated policy merely to silence the advisor.

### SEC-73D-03 — Worker-secret verifier privilege was checked

The live function `public.simula_verify_worker_secret(text)` is SECURITY DEFINER. Its effective privilege check confirms:

- `service_role` EXECUTE: true
- `authenticated` EXECUTE: false
- `anon` EXECUTE: false
- `PUBLIC` EXECUTE: false

Both deployed cron worker and candidate cron worker call the verifier through the service-role client. The earlier ACL-only concern is therefore **not a confirmed defect**; effective inherited privilege is present. Keep this function restricted to the service role and continue checking both ACL and effective privileges.

## 4. Deployed Edge Function parity

All three deployed functions are ACTIVE at version 1. Supabase returned the following runtime source identifiers. GitHub blob SHAs are shown separately and are not directly comparable to the runtime SHA field because they are different identifiers.

| Function | Deployed runtime SHA | GitHub source blob SHA | Exact source text match |
|---|---|---|---|
| `simula-workflow-worker` | `91e3dcf52d08f2a426476298fbb3e64ef5f29fa99bf7f2adfb24b80c15a37b5e` | `c61f89f4cc5c40fcbf74e4a1b1490366dfe5c628` | No |
| `simula-workflow-cron-worker` | `c4e7e7aac6a6c9104fc3f8efd8bfed790256a44d3bda521ef5da6488f6b7de26` | `b5360553ac48a4101b96a32d85cdaec8eefc0346` | No |
| `ashaa-api-key-manager` | `a4b4ce8cc8e47413e22e54a867f306e7ce51b3880d96a953b4638e2729a51da0` | `536006db5de8118fa2e52f8f4488a356b1aab162` | No |

### Runtime drift details

1. The deployed authenticated worker lacks the candidate's attempt-generation compare-and-set checks. Candidate code filters step/run updates by attempt generation and rejects superseded workers.
2. The deployed cron worker also lacks candidate attempt-generation fencing.
3. The deployed API-key manager uses wildcard CORS (`Access-Control-Allow-Origin: *`) and parses request JSON directly. Candidate source uses an exact-origin allowlist and a bounded JSON-body parser.
4. Candidate API-key manager uses the shared CORS adapter. The allowlist must be configured and verified before rollout; an empty allowlist intentionally denies browser origins.
5. All three deployed functions differ from candidate source, so a GitHub green check cannot establish deployed runtime correctness.

**Assessment:** HIGH release blocker. Stale worker generations may write state after a newer retry generation has taken ownership. The source-level candidate addresses this with conditional updates, but the live functions have not been updated.

**Recommendation:** prepare a separately approved, function-by-function rollout. Before deployment, confirm the exact source commit, required environment variables, worker secret rotation/verification, cron caller behavior, CORS allowlist, rollback version, and isolated end-to-end tests. Do not deploy from this audit branch.

## 5. Advisor observations

### Security advisor

One INFO finding: RLS enabled with no policies on `public.billing_webhook_events`. Based on effective grants, this is consistent with intended server-only access. Keep the table inaccessible to `anon` and `authenticated`.

### Performance advisor

Six indexes were reported unused:

- `user_projects_tool_id_fkey_idx`
- `usage_logs_tool_id_fkey_idx`
- `payments_subscription_id_fkey_idx`
- `platform_api_keys_owner_created_idx`
- `billing_webhook_events_status_received_idx`
- `credit_ledger_owner_created_idx`

**Do not drop these automatically.** An unused-index signal may reflect low traffic or a reset statistics window. First capture observation duration, query plans, write overhead, FK lookup requirements, and expected workload. Any removal requires isolated rehearsal and a separate migration proposal.

### Health advisor

No health lints were returned.

## 6. Repeatable read-only diagnostic

The companion SQL file `supabase/diagnostics/phase-73d-read-only-catalog-audit.sql` contains SELECT-only catalog queries. It does not read application row payloads, API keys, Vault secret values, auth credentials, or environment variables. It inspects public table RLS/policy coverage, grants, selected function privilege state, indexes, triggers, and migration ledger versions.

## 7. Required next gates

1. Phase 74: create exact deployed-versus-candidate source diff artifacts for all three functions, including shared dependencies and runtime configuration requirements.
2. Rehearse the API-key column-grant migration in disposable PostgreSQL 17 and prove safe metadata reads, blocked hash reads, narrow revocation updates, and service-role manager behavior.
3. Add a regression assertion that `billing_webhook_events` remains ungranted to `anon` and `authenticated`.
4. Extend worker tests to verify stale generation cannot finish, fail, or overwrite a newer attempt for both worker paths.
5. Validate API-key manager CORS with allowed, disallowed, missing, and preflight origins, plus oversized and malformed bodies.
6. Prepare a human-reviewed rollout plan with rollback. Deployment remains blocked until explicit approval.

## 8. Scope and safety

- Read-only metadata queries and Edge Function source retrieval only.
- No application row payloads, Vault secret values, API keys, tokens, or environment secrets were retrieved for this report.
- No SQL DDL/DML, GRANT/REVOKE, migration application, secret change, Edge Function deployment, Vercel deployment, merge, billing change, or production scheduling change.
- Phase 73D status remains **PARTIAL** until worker parity and the candidate API-key privilege migration are independently rehearsed and approved.
## 9. Repository audit-guard CI evidence

The branch adds `scripts/verify-phase-73d-read-only.mjs`, exposed as `npm run verify:phase-73d`, plus a branch-scoped GitHub Actions workflow with `contents: read` permission.

- Workflow run: [44820078976](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/44820078976)
- Exact tested head: `a4b10f7542cf5ce14de5c1a9513a53843f3c444a`
- Result: SUCCESS
- The guard confirms that every executable statement in the companion diagnostic SQL starts with SELECT, checks for prohibited write/DDL operations, and verifies that the report records the required live observations and read-only scope.

This CI validates the diagnostic artifact's read-only contract. It does not repeat the live Supabase queries or test deployed Edge Function behavior.
