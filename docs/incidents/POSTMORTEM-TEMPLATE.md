# Incident Postmortem — [Short factual title]

> Use only after a real incident. Do not fill unknown facts with guesses. Mark unknown fields **UNKNOWN** and link evidence where possible.

## Status
- Incident ID:
- Severity:
- Status: Draft / Reviewed / Actions in progress / Closed
- Incident date and timezone:
- Start and end time:
- Authors and reviewers:

## Executive summary
[What happened, who or what was affected, duration, and current state. Keep this factual.]

## Impact
- Affected services/features:
- User/customer impact:
- Data integrity or confidentiality impact:
- Geographic or tenant scope:
- Duration:
- What was not affected:

## Detection
- How was it detected?
- Which alert, log, report or user signal identified it?
- Detection delay:
- Was the alert actionable?

## Timeline (timezone required)
| Time | Event | Evidence / source |
|---|---|---|
| YYYY-MM-DD HH:MM TZ | [Factual event] | [Link or identifier] |

## Technical analysis
- Trigger:
- Contributing conditions:
- Root cause (only when supported by evidence):
- Why existing controls did not prevent or detect it:
- Relevant commits, deployments, configuration changes or dependencies:

## Response and recovery
- Containment actions:
- Recovery actions:
- Rollback or restore performed:
- Verification that service recovered:
- Communication and escalation:

## What went well
[Systems, processes and decisions that reduced impact.]

## What could be improved
[Process and system weaknesses. Blameless language; focus on conditions, not individuals.]

## Corrective and preventive actions
| Action | Priority | Owner | Due date | Verification / acceptance criteria | Status |
|---|---|---|---|---|---|
| [Specific measurable action] | P0/P1/P2 | [Role] | YYYY-MM-DD | [Test/evidence] | Open |

## Lessons and follow-up
- New tests or alerts required:
- Documentation/runbooks to update:
- Security/privacy review required:
- Related ADRs:
- Follow-up review date:

## Evidence handling
- Link relevant CI run, PR, commit, deployment and sanitized logs.
- Never paste secrets, access tokens, private customer data or raw sensitive payloads.
- Preserve original evidence according to retention and access policy.

## Closure criteria
- User impact resolved.
- Root cause and uncertainty documented.
- Corrective actions assigned.
- Recovery and regression tests recorded.
- Required stakeholders reviewed the postmortem.
