# InfiniteX Database Schema Proposal

**Status:** PROPOSED — documentation only.  
**Database target:** PostgreSQL.  
**Migration status:** No SQL migration created or executed.

## Design principles
- Keep the first schema deliberately small and workspace-aware.
- Use UUID primary keys and timestamptz timestamps.
- Use explicit foreign keys, unique constraints and query-driven indexes.
- Do not duplicate OIDC-owned password credentials.
- Store no raw bearer tokens, authorization codes, provider client secrets or payment credentials.
- Minimize personal data. Do not add government identifiers, precise location or unnecessary profile fields.
- Server-side authorization, not client role claims, is authoritative.

## Proposed tables

### users
| Column | Type proposal | Notes |
|---|---|---|
| id | uuid | Primary key |
| status | text/enum | active, disabled, pending_review |
| created_at | timestamptz | UTC |
| updated_at | timestamptz | UTC |

### identity_links
| Column | Type proposal | Notes |
|---|---|---|
| id | uuid | Primary key |
| user_id | uuid | FK to users |
| issuer | text | Exact trusted OIDC issuer |
| subject | text | OIDC subject; not user-editable |
| created_at | timestamptz | UTC |

Unique constraint: (issuer, subject). Do not store provider secrets or unnecessary token payloads.

### workspaces
| Column | Type proposal | Notes |
|---|---|---|
| id | uuid | Primary key |
| name | text | Validated display name |
| created_by | uuid | FK to users |
| created_at | timestamptz | UTC |
| updated_at | timestamptz | UTC |

### workspace_memberships
| Column | Type proposal | Notes |
|---|---|---|
| workspace_id | uuid | FK to workspaces |
| user_id | uuid | FK to users |
| role | text/enum | owner, admin, member, viewer |
| granted_at | timestamptz | UTC |
| granted_by | uuid | FK to users; bootstrap exception needs review |

Composite primary key: (workspace_id, user_id). Define safe ownership transfer and last-owner protection before implementation.

### sessions (optional local session layer)
| Column | Type proposal | Notes |
|---|---|---|
| id | uuid | Primary key |
| user_id | uuid | FK to users |
| token_hash | bytea | Hash of opaque local session token |
| created_at | timestamptz | UTC |
| expires_at | timestamptz | UTC |
| revoked_at | timestamptz | Nullable |

Never persist raw session tokens. Decide whether the selected OIDC provider or application owns session lifecycle before creating this table.

### audit_events (later phase)
| Column | Type proposal | Notes |
|---|---|---|
| id | uuid | Primary key |
| actor_user_id | uuid | Nullable for system events |
| workspace_id | uuid | Nullable |
| event_type | text | Allowlisted event name |
| target_type | text | Resource category |
| target_id | uuid | Nullable |
| request_id | text | Correlation ID |
| metadata | jsonb | Strict allowlist; no secrets or arbitrary request bodies |
| occurred_at | timestamptz | UTC |

Audit retention, partitioning, tamper-evidence and privileged access need separate review.

## Relationship sketch
- users 1-to-many identity_links
- users many-to-many workspaces through workspace_memberships
- users 1-to-many sessions, if local sessions are selected
- users 1-to-many audit_events as actor

## Constraints and transaction rules
- Unique issuer + subject on identity_links.
- Unique workspace + user membership.
- Foreign keys prevent orphan identities and memberships.
- Prevent removing or demoting the last workspace owner.
- Workspace-scoped data queries must include the authenticated workspace membership.
- Membership changes and audit records should commit atomically.
- Use restrictive deletion initially; define account/workspace deletion and retention explicitly.

## Explicitly excluded
No billing, subscriptions, entitlements, AI usage ledger, API keys, file metadata, email verification tokens or job queue tables. Each requires separate requirements and data ownership decisions.

## Migration review checklist
1. Approve OIDC provider and identity mapping.
2. Approve workspace role matrix and last-owner invariant.
3. Decide local session ownership and lifecycle.
4. Confirm deletion, retention and backup/restore policy.
5. Review constraints, indexes and transaction semantics.
6. Test forward migration and restore on disposable synthetic data.
7. Verify least-privilege runtime and migration roles.
8. Obtain explicit approval to create and execute migration.

This document is not executable SQL and does not authorize a migration.
