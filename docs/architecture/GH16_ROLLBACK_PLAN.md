# GH-16 — Rollback and Recovery Plan

**Status:** Proposed operational plan; no deployment or migration has been performed.

## 1. Safety principles

- Prefer reversible, small changes.
- Keep the default branch and production environment untouched during implementation.
- Never treat a Git revert as a database rollback.
- Preserve evidence and logs needed to diagnose failures.
- Obtain explicit approval before production changes, migrations, deployment, or destructive recovery.

## 2. Code rollback

For an isolated implementation branch:
1. Stop further changes.
2. Record current branch name and HEAD SHA.
3. Identify the specific commit(s) causing regression.
4. Review the diff and dependent commits.
5. Prefer a targeted revert commit over force-pushing shared history.
6. Run the relevant tests on the reverted branch.
7. Request review before any merge.

Do not reset or force-push a shared branch without explicit authorization.

## 3. Frontend rollback

- Keep the last known-good build/deployment reference.
- Revert the frontend change that introduced the regression.
- Verify environment configuration and API compatibility.
- Run build and browser smoke tests.
- Do not claim rollback success until the target environment is checked.

## 4. API rollback

- Maintain backward compatibility during staged frontend/backend rollout.
- Avoid removing fields or endpoints while clients may still use them.
- Use feature flags only when their ownership and default state are clear.
- Revert application code independently from schema changes only when compatibility permits.

## 5. Database migration safety

Before any production migration (not authorized in this phase):
- Review SQL and expected lock/downtime impact.
- Confirm backup and restore point.
- Prefer additive expand/contract migrations.
- Test migration against a disposable database with representative synthetic data.
- Document forward-fix and rollback feasibility.
- Obtain explicit human approval.

A migration that drops or rewrites data may not be safely reversible. In such cases, recovery may require restoring a backup or applying a reviewed forward fix. Never promise lossless rollback without evidence.

## 6. Incident response

1. Detect and classify severity.
2. Stop risky automated actions.
3. Preserve logs and relevant commit/deployment identifiers.
4. Contain the affected feature using a safe reversible control.
5. Restore known-good behavior.
6. Verify health, authorization, and critical user flows.
7. Document root cause and follow-up tests.
8. Obtain approval before re-enabling affected functionality.

## 7. Recovery evidence checklist

- [ ] Incident/change identifier recorded.
- [ ] Previous and current commit SHAs recorded.
- [ ] Affected components identified.
- [ ] Data impact assessed.
- [ ] Backup/restore status verified if data is involved.
- [ ] Recovery action reviewed.
- [ ] Tests run and logs retained.
- [ ] Security boundaries re-tested.
- [ ] Human approval recorded.

## 8. Explicit exclusions

This plan does not authorize:
- Production deployment or rollback.
- Database migration or restoration.
- Deletion of data or resources.
- Billing or provider activation.
- Merge to `main`.
- Force-push or history rewrite.
