# Monitoring, Logging & Alerting Standard

**Status:** Operational requirements. Live provider configuration and alert delivery are NOT VERIFIED by this document.

## Service-level signals
Track, where supported:
- Availability and successful request rate.
- HTTP 4xx/5xx rates and latency percentiles.
- Frontend runtime exceptions and failed critical journeys.
- Worker execution success/failure, queue depth and oldest queue age.
- Retry counts, duplicate/idempotency conflicts and stale leases.
- Database connectivity, query errors and resource saturation.
- Authentication/authorization denials and suspicious request patterns.

## Structured logging
Use consistent fields: timestamp, severity, service, environment, version/commit, request/correlation ID, operation and sanitized error code.
- Never log passwords, API keys, bearer tokens, cookies, secret values, full payment data or unnecessary personal data.
- Avoid logging full request bodies.
- Sanitize untrusted strings to prevent log injection.
- Restrict log access and retention according to data sensitivity.

## Alert design
Each alert must include:
- User impact and severity.
- Trigger condition and evaluation window.
- Owner/on-call route.
- Runbook link and first safe diagnostic steps.
- Escalation and acknowledgement expectation.
- Clear recovery condition to avoid alert flapping.

Prioritize actionable alerts over noisy dashboards. Alert on symptoms affecting users and critical workflows, not every internal event.

## Validation checklist
1. Confirm the provider and environment.
2. Verify ingestion from a harmless synthetic event.
3. Verify redaction using test credentials that are not real.
4. Trigger a controlled test alert in non-production.
5. Confirm notification delivery and runbook links.
6. Verify access restrictions and retention.
7. Record screenshots/links, timestamps and configuration evidence.

## Status reporting
Mark each signal VERIFIED, PARTIAL, BLOCKED or NOT TESTED. Do not claim monitoring is active merely because a dashboard or SDK dependency exists.
