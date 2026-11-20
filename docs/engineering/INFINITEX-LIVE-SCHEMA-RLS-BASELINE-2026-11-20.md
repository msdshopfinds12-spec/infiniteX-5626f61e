# InfiniteX Live Schema and RLS Baseline

**Inspection date:** 2026-11-20  
**Supabase project:** Ashaa-INX (`vepacoemkhudamfaccah`)  
**Inspection mode:** Read-only metadata and catalog queries  
**Status:** VERIFIED BASELINE / REMEDIATION NOT APPLIED

## Scope and safety

This document records live schema metadata, generated type parity, RLS policies, and authenticated column privileges. The inspection did not insert, update, or delete application data; change schema, policies, grants, secrets, or migrations; deploy functions; or change billing.

## Verified project and type parity

- Project status: `ACTIVE_HEALTHY`.
- PostgreSQL major version: 17.
- 14 public tables were returned by verbose schema introspection; all 14 report RLS enabled.
- The existing `src/lib/supabase/database.types.ts` was compared against freshly generated Supabase TypeScript schema types. After removing the repository's three-line provenance header, the type bodies matched exactly (21,508 characters). No duplicate type file or overwrite is required.
- The generated types report PostgREST version `14.18`.

## Live RLS policy inventory

All policies below target the `authenticated` role.

| Table | Verified policy behavior |
|---|---|
| `profiles` | SELECT own row by `id = auth.uid()`; UPDATE own row with matching USING and WITH CHECK |
| `tools` | SELECT rows where `is_active` |
| `user_projects` | SELECT / INSERT / UPDATE / DELETE own rows by `user_id = auth.uid()`; UPDATE has matching WITH CHECK |
| `usage_logs` | SELECT own rows by `user_id = auth.uid()` |
| `subscriptions` | SELECT own rows by `user_id = auth.uid()` |
| `payments` | SELECT own rows by `user_id = auth.uid()` |
| `workflows` | ALL operations scoped by `owner_id = auth.uid()` in USING and WITH CHECK |
| `workflow_steps` | ALL operations require a parent workflow owned by `auth.uid()` |
| `workflow_runs` | SELECT own rows; INSERT requires `owner_id = auth.uid()` and a parent workflow owned by the same user |
| `workflow_step_runs` | SELECT own rows by `owner_id = auth.uid()` |
| `workflow_logs` | SELECT own rows by `owner_id = auth.uid()` |
| `platform_api_keys` | SELECT own rows; UPDATE own rows, with USING and WITH CHECK |
| `credit_ledger` | SELECT own rows by `owner_id = auth.uid()` |
| `billing_webhook_events` | RLS enabled; no policy was returned in the inspected policy inventory |

RLS being enabled is not proof of complete authorization. The absence of a policy generally means the role cannot access rows through RLS, but effective access also depends on grants, views, functions, and service-role paths.

## Authenticated column-privilege findings

The catalog query returned these important column-level privileges:

### P1 — workflow run insertion can set server-owned result fields

The `authenticated` role has INSERT privileges on `workflow_runs` fields including `status`, `output`, `error_message`, `attempt`, `started_at`, `finished_at`, and `scheduled_for`. The current INSERT policy validates owner identity and parent workflow ownership, but does not constrain those lifecycle/result fields to a server-selected initial state.

**Risk:** a browser client may be able to create a run row that appears already completed, failed, or otherwise worker-managed. This can corrupt auditability and any UI that treats inserted status/output as trusted execution evidence.

**Frontend rule:** do not expose direct browser INSERT into `workflow_runs`; do not treat client-originated status/output as authoritative. Use a narrowly scoped server-side operation that creates only a queued run and derives the owner from the authenticated identity. Worker-owned transitions and output must remain server-side.

**Backend remediation candidate (NOT APPLIED):** review a least-privilege column grant and/or a restrictive INSERT policy that fixes allowed initial fields, after inspecting worker claim semantics and existing function contracts. Do not apply a migration until separately approved and tested.

### P1 — API-key hash is selectable by the owning authenticated user

The `authenticated` role has SELECT privilege on `platform_api_keys.key_hash`, alongside display metadata. The RLS policy limits rows to the current owner, but it does not hide individual columns.

**Frontend rule:** never select or return `key_hash` to the browser. Use an explicit safe-column projection such as `id,label,key_prefix,scopes,expires_at,last_used_at,revoked_at,created_at`. Never display or log stored hashes.

**Backend remediation candidate (NOT APPLIED):** consider revoking authenticated SELECT on `key_hash` while retaining only required safe-column privileges. Validate any server-side verification path before changing grants.

### Verified positive control — profile role is not client-updatable

The inspected authenticated column privileges include UPDATE on `profiles.display_name` and `profiles.avatar_url`, but not on `profiles.role`. The owner UPDATE policy is therefore not, by itself, evidence that a user can self-promote through the currently inspected column grants. Keep authorization decisions server-side and never trust editable user metadata.

## Safe frontend data-access boundaries

1. Auth identity must come from the Supabase session; never accept an owner/user ID as an authorization input from a form, URL, local storage, or client state.
2. Start with read-only queries and explicit safe-column projections.
3. Do not query `platform_api_keys.key_hash`.
4. Do not insert, update, or fabricate `workflow_runs` status/output from the browser.
5. Keep billing/webhook, credit ledger mutation, worker RPCs, and privileged operations server-side.
6. Treat dashboard metrics as unavailable until real telemetry is connected; keep the current demo banner.
7. RLS is the database boundary; React route guards are UX only.

## Required follow-up verification

- Inspect the worker claim/transition functions and confirm they only process valid queued runs.
- Review all grants on the relevant functions, including EXECUTE grants, before designing any RPC adapter.
- Build isolated synthetic-account tests for owner A / owner B access and forbidden write paths.
- Test that a browser-authenticated client cannot create forged completed/failed workflow runs.
- Test that API-key list queries never expose `key_hash`.
- Only after tests, prepare a separate least-privilege migration proposal for human review.

## Explicitly not done

- No production DDL, DML, GRANT/REVOKE, RLS policy change, migration, secret change, or Edge Function deployment.
- No live user records were modified.
- No PR merge, Vercel change, or deployment.


## Phase 49 frontend authorization safeguards — source-only

The Phase 49 implementation adds a fail-closed browser bootstrap and a typed capability decision helper. These changes do not modify or assert new live RLS behavior.

- Missing/invalid public Supabase configuration now produces an auth error state instead of rendering the application shell without verified auth.
- The App shell fails closed if auth state is absent.
- A client-side capability snapshot is checked for current subject match, expiry, and requested capability before any future UI feature is enabled.
- The capability helper is a UX control only. Browser state is user-modifiable and must never be treated as authoritative authorization.
- Every server operation must independently derive the authenticated subject and enforce authorization; database RLS remains the enforcement boundary.
- Existing P1 constraints remain: never select `platform_api_keys.key_hash`; never create workflow runs or set worker-owned status/output from the browser.
- No live database schema, grants, policies, data, or migrations were changed.
