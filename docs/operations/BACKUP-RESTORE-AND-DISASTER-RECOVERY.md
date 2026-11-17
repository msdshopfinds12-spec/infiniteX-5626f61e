# Backup, Restore & Disaster Recovery Standard

**Status:** Requirements and drill procedure. Actual backup schedules, retention, encryption and restore success are NOT VERIFIED here.

## Recovery objectives
Agree on:
- **RPO:** maximum tolerable data loss measured in time.
- **RTO:** maximum tolerable service recovery time.
- Critical workflows and acceptable degraded operation.
- Data retention, privacy and regulatory requirements.

Do not invent RPO/RTO values. Record stakeholder-approved targets per service.

## Scope inventory
Include database, object/file storage, auth/configuration, DNS and routing, deployment artifacts, encryption-key recovery dependencies and operational documentation. Never export secrets into ordinary backups or logs.

## Backup controls
- Use provider-supported backups and point-in-time recovery where available.
- Confirm schedule, retention, encryption, region and access policy.
- Separate backup administration from routine application credentials.
- Protect against accidental deletion and compromised operator accounts.
- Document dependencies and restore ordering.
- Verify backup completion and alert on missed/failed backups.

## Restore drill (isolated environment only)
1. Obtain approval and select a non-production target.
2. Identify a known backup timestamp and record its provenance.
3. Restore without overwriting production.
4. Validate schema, row counts and referential integrity using safe synthetic checks.
5. Validate RLS/permissions and application connectivity.
6. Run critical workflow smoke tests.
7. Measure achieved RPO/RTO and record failures.
8. Securely remove temporary test resources after approval.
9. Update the runbook and assign corrective actions.

## Disaster recovery sequence
1. Declare incident and assign incident lead.
2. Protect users; isolate compromised components if needed.
3. Preserve evidence and prevent further data loss.
4. Restore identity, network and data dependencies in documented order.
5. Deploy a known-good application artifact.
6. Validate authorization, tenant isolation and critical workflows.
7. Communicate recovery status.
8. Reconcile queued/partially processed work with idempotency controls.
9. Conduct a blameless postmortem.

## Evidence required
Backup job status, retention policy, restore logs, test results, measured RPO/RTO, approver, date and exact environment. A backup is not proven recoverable until a restore test succeeds.
