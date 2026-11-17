# CI, Deployment Failure & Rollback Runbook

**Status:** Generic safe runbook. Adapt to the verified provider and project configuration before operational use.

## A. CI failure
1. Identify exact repository, branch, commit SHA and workflow run.
2. Locate the first failing job and first failing step.
3. Read complete relevant logs; redact secrets before sharing.
4. Classify: code, test flake, dependency, runner, permission, external service or configuration.
5. Reproduce with the documented command/environment when safe.
6. Fix the root cause on a branch; add a regression test.
7. Rerun the full required workflow on the new commit.
8. Report pass/fail by exact SHA. Do not waive required checks to force a merge.

## B. Deployment failure
1. Stop further rollout; do not repeatedly retry blindly.
2. Determine whether deployment partially changed application, schema, configuration or traffic routing.
3. Check provider status and sanitized deployment logs.
4. Assess user impact, data integrity and security exposure.
5. Choose rollback or forward-fix based on compatibility and data state.
6. Obtain explicit release/operator approval before production action.
7. Validate health, authorization, critical journeys and logs after recovery.

## C. Rollback decision
Rollback when the deployed version causes material user impact, security regression, data corruption risk or violates an agreed release gate and a compatible prior artifact exists.

Before rollback:
- Confirm the exact known-good artifact and source SHA.
- Check database/schema compatibility.
- Check whether background jobs or external side effects need reconciliation.
- Identify whether rollback is reversible.
- Obtain approval.

After rollback:
- Confirm deployed version and traffic routing.
- Run smoke tests and tenant-isolation checks.
- Monitor error rates and queue state.
- Preserve incident evidence and open corrective actions.

## D. Important limitations
- Application rollback does not automatically reverse database migrations.
- Feature flags are not authorization controls.
- Do not delete data, reset a database, alter secrets or change production configuration as a troubleshooting shortcut.
- If no safe rollback exists, stop and escalate with evidence.
