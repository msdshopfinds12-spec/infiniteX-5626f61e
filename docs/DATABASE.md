# Database plan — not provisioned

No database connection or migration is included. Add PostgreSQL only after schema and authorization review.

Proposed entities: app_users (external subject mapping), agents, tasks (with idempotency key), ai_usage (provider/model/token/cost ledger), audit_events.

Required before migration:
1. Select identity provider and immutable subject claim.
2. Define tenant ownership and foreign keys.
3. Design RLS policies and test using non-owner roles.
4. Define retention, deletion, backup, and restore policy.
5. Review indexes and migration rollback.
6. Obtain separate approval before applying migrations.