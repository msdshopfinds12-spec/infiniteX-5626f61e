# InfiniteX Phase 50 — Trusted Backend Authorization Architecture

**Status:** DESIGN BASELINE — implementation and live enforcement not yet verified  
**Parent:** PR #60 head `7606e9fb574acc57138baa02ff36407ae0bd61d5`  
**Branch:** `feat/phase-50-trusted-authorization`  
**Safety:** source-only; no database, secrets, billing, deployment, or production changes

## 1. Security objective

Establish a trusted server-side authorization boundary before enabling account-sensitive data, workflow execution, AI agents, API-key operations, or billing features.

The browser is untrusted. React route guards, local storage, permission snapshots, request body fields, and user-editable metadata are never authoritative.

## 2. Trust model

1. The browser sends a Supabase access token in the Authorization header.
2. A trusted Edge Function validates the token with Supabase Auth `getUser(token)`; decoding a JWT without signature verification is insufficient.
3. The server derives the subject exclusively from the verified Auth user.
4. The server loads authorization facts from a documented, server-controlled source of truth. Until that source is verified, the decision is deny-by-default.
5. Each data operation independently enforces owner scope and least privilege. Database RLS remains an independent enforcement layer.
6. Worker-owned workflow state and secret material remain server-side.

## 3. Capability vocabulary

Existing UI capability names are retained as identifiers, not grants:

- `workspace.read`
- `agents.read`
- `agents.execute`
- `workflows.read`
- `workflows.execute`
- `logs.read`
- `security.read`
- `settings.manage`

No capability is granted merely because it appears in this list. Role-to-capability mapping must be established from verified schema and policy semantics. Missing, malformed, expired, or unavailable policy data means deny.

## 4. Authorization decision contract

Inputs:
- Verified Auth subject from Supabase Auth.
- Requested capability from a strict allowlist.
- Server-derived account/tenant membership and role facts.
- Current server time.

Outputs:
- Allow only when identity is verified, membership is active, policy source is authoritative, and the capability is explicitly granted.
- Otherwise deny with a non-sensitive reason code.

Never accept `user_id`, `owner_id`, role, permission arrays, or account identity from the browser as proof of authority.

## 5. Data boundaries

### API-key metadata
Browser-safe fields only: `id,label,key_prefix,scopes,expires_at,last_used_at,revoked_at,created_at` (subject to exact schema confirmation). Never select, serialize, log, or return `key_hash`.

### Workflow runs
Browser may request an enqueue operation only. The server derives owner identity and validates workflow ownership/state. The initial run state is server-selected. Browser input cannot set `status`, `output`, `error_message`, `attempt`, `started_at`, or `finished_at`. Worker transitions remain worker-owned.

### Account data
Begin with explicit read-only projections and authenticated RLS-scoped queries. Do not accept owner identifiers as query authority. Verify effective grants, views, RPCs, and service-role paths separately.

## 6. Known live-schema observations from the PR #60 baseline

The baseline document reports:
- authenticated SELECT privilege on `platform_api_keys.key_hash`;
- authenticated INSERT privileges on worker-managed `workflow_runs` columns;
- RLS enabled on the inspected public tables.

These are catalog observations, not proof of exploitability in every query path. They require least-privilege remediation design and isolated tests. The baseline labels remediation as not applied. Do not change grants or policies in this phase without a separate reviewed migration and explicit approval.

## 7. Alternatives considered

1. **Preferred: Edge Function + verified Auth + RLS-scoped Supabase client.** Keeps identity verification server-side while avoiding service-role access for ordinary user data.
2. **Narrow privileged service operation.** Use only when a worker-owned operation cannot be expressed safely under the user's RLS context; keep secrets server-side, validate all inputs, and restrict the operation to one purpose.
3. **Direct browser table access.** Acceptable only for explicitly safe, owner-scoped read operations where column grants and RLS have been verified. Not acceptable for workflow lifecycle fields or secret hashes.

## 8. Non-goals and release gates

This architecture document does not claim that backend authorization, RLS isolation, or production security is complete. Required before production:
- authoritative role/membership source documented;
- server-side authorization tests;
- synthetic owner A/B isolation tests;
- forbidden-write tests;
- API-key hash non-disclosure tests;
- workflow enqueue/worker-integrity tests;
- live schema/grant review;
- independent security audit;
- human-approved migration and release gates.
