# Production Incident Response Runbook

**Status:** Response framework. Use only with verified system-specific contacts and provider procedures.

## 1. Declare and coordinate
- Assign incident lead, technical lead, communications owner and scribe.
- Record start time/timezone, severity, affected services and known user impact.
- Use one incident record and a shared timeline.

## 2. Stabilize and protect
- Prioritize user safety, data confidentiality and integrity.
- Contain the affected component using approved controls.
- Avoid destructive diagnostics and avoid exposing secrets or personal data.
- Preserve relevant sanitized logs, request IDs, commit/deployment identifiers and provider events.

## 3. Diagnose
- Compare current and last known-good version/configuration.
- Check service health, error rate, latency, queue backlog and dependency status.
- Separate confirmed facts from hypotheses.
- Do not run unreviewed SQL or production mutations during investigation.

## 4. Recover
- Follow the deployment rollback or disaster-recovery runbook.
- Require approval for production deployment, migration, secret rotation or data operation.
- Validate health, authorization boundaries, tenant isolation and critical user journeys.

## 5. Communicate
- State what is affected, when it began, current mitigation and next update time.
- Do not speculate about root cause or claim resolution before verification.
- Avoid disclosing security-sensitive details publicly.

## 6. Close and learn
- Confirm service stability over an agreed observation window.
- Preserve evidence and complete the postmortem template.
- Assign prioritized corrective actions with owners, due dates and measurable acceptance criteria.
- Add regression tests, alerts or runbook changes.
- Review action completion; close only with evidence.
