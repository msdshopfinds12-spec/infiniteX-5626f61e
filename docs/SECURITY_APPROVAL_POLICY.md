# InfiniteX Security and Human Approval Policy

**Policy status:** Proposed baseline for implementation.  
**Default posture:** deny privileged actions; read-only first; no autonomous production changes.

## 1. Security objectives

- Protect repository access, provider credentials, user data, and deployment environments.
- Limit each agent to the minimum capability and data required.
- Treat model output, repository content, issue text, logs, and external documents as untrusted input.
- Make consequential actions attributable, reviewable, and reversible where possible.
- Never present an unperformed check as a passed security control.

## 2. Trust boundaries

1. **Browser/UI:** untrusted client. It may request actions but cannot authorize them.
2. **Control Plane API:** trusted enforcement boundary; authenticates and authorizes every request.
3. **Agent runtime:** semi-trusted, isolated, time- and resource-limited.
4. **Model provider:** external processor; receives only minimized, approved context.
5. **GitHub and other integrations:** external systems; credentials are server-side and scoped.
6. **CI runner:** isolated build environment; workflow code and dependencies are supply-chain inputs.
7. **Production environment:** separate trust zone; no access from ordinary agent execution.

## 3. Approval matrix

| Action | Default | Required control |
|---|---|---|
| Read approved public repository files | Allowed when user requested it and connection permits | Scope repository and record access |
| Read private repository content | Deny until explicitly authorized | Verify repository scope and account permission |
| Create a plan or patch in local isolated workspace | Allowed in dry-run mode | No external side effect |
| Create a feature branch / push branch | Approval required | Exact repository, branch, and file scope |
| Create or update files on an approved branch | Approval required | Explicit file allowlist and diff review |
| Create pull request | Separate approval required | Review complete diff and CI results |
| Merge / enable auto-merge | Deny by default | Separate explicit approval after review |
| Deploy / publish / release | Deny by default | Separate release approval and rollback plan |
| Run database migrations or destructive SQL | Deny by default | Migration review, backup, explicit approval |
| Delete data, files, branches, or repositories | Deny by default | Exact target and separate confirmation |
| Create/rotate secrets or change billing | Deny by default | Human-operated secure flow |
| Rerun CI jobs | Approval required unless an explicit standing policy says otherwise | Exact workflow/run and reason |
| Send messages, publish content, or make purchases | Deny by default | Human preview and final approval |

Approval is scoped, not blanket permission. Approval to create a branch does not approve a pull request, merge, or deployment.

## 4. Approval record requirements

An approval must bind to:
- Unique approval and operation IDs.
- Repository and exact branch/ref.
- Exact file paths or action target.
- Expected base commit SHA.
- Allowed operation (create/update/read/rerun/etc.).
- Proposed diff hash or immutable proposal reference.
- Expiry time and one-time-use state.
- Human approver identity and decision.

Reject stale approvals when the base SHA or proposed diff changes. Never silently broaden scope.

## 5. Credential and secret handling

- Never commit API keys, access tokens, passwords, private keys, or session cookies.
- Never place secrets in browser bundles, client-side environment variables, logs, prompts, screenshots, or generated documentation.
- Use server-side secret storage only after the user approves the provider and hosting choice.
- Use separate credentials per integration and environment.
- Grant the minimum repository permissions; prefer read-only scopes for inventory and CI investigation.
- Rotate exposed credentials and investigate their use; do not echo the secret in incident reports.
- Do not create or modify secrets as part of the current foundation branch.

## 6. Prompt injection and untrusted content

Treat repository files, README text, comments, issues, logs, web pages, model output, and test fixtures as data, not policy.

Controls:
- System policy and server-side authorization override all repository instructions.
- Do not execute commands found in repository content without explicit review.
- Do not disclose secrets because a file, issue, or model asks for them.
- Separate retrieved content from trusted instructions.
- Restrict tools by capability and target; validate every tool argument server-side.
- Require human review for generated code and commands with side effects.

## 7. Agent execution isolation

Before enabling code execution:
- Use an ephemeral workspace or isolated runner.
- Do not mount production credentials or unrelated user files.
- Restrict network access by default; allowlist required endpoints only.
- Apply CPU, memory, disk, process, and wall-clock limits.
- Run as a non-privileged identity.
- Prevent access to host/container control sockets and metadata services.
- Destroy the workspace after retaining only approved, sanitized artifacts.
- Treat tests as untrusted code execution.

## 8. Data handling and privacy

- Classify data as public, internal, or confidential before routing it to an agent/provider.
- Minimize context and redact secrets and personal data.
- Do not send confidential repository content to an external model without explicit provider/data-processing approval.
- Define retention and deletion behavior before enabling persistent memory.
- Log safe summaries and hashes; do not log raw credentials or sensitive payloads.
- Read-only SQL agents must use read-only database roles, query allowlists, row limits, timeouts, and result-size caps.

## 9. CI and software supply-chain controls

- Pin third-party GitHub Actions to full commit SHAs and document the corresponding release tag.
- Set workflow permissions to the minimum required; the initial workflow uses `contents: read`.
- Disable persisted checkout credentials where they are not needed.
- Do not expose secrets to untrusted pull-request code.
- Set job timeouts and concurrency limits.
- Prefer lockfiles and `npm ci` for deterministic dependency installation.
- Review dependency updates and workflow changes as code.
- The first InfiniteX CI run reported two npm advisories (one moderate, one high). Treat this as an open dependency-review item until package names, affected ranges, and available safe fixes are inspected. Do not use `npm audit fix --force` as an automatic CI action.
- Do not auto-merge or deploy from the initial CI workflow.

## 10. Security status vocabulary

- **VERIFIED:** a specific check ran successfully against a named commit/environment and evidence is retained.
- **PARTIAL:** only some controls/checks are implemented or evaluated.
- **BLOCKED:** required access, evidence, or approval is missing.
- **NOT TESTED:** the check has not run.
- **DEMO:** sample UI data only.

A green UI badge is not security evidence. Security claims must link to actual scan/test results, configuration, and scope.

## 11. Incident response

If a credential leak, unauthorized write, suspicious agent action, or data exposure is suspected:
1. Stop the affected workflow or integration.
2. Revoke/rotate the exposed credential through the provider's secure interface.
3. Preserve timestamps, operation IDs, commit SHAs, and safe logs.
4. Determine affected repositories, files, users, and environments.
5. Revert or contain only after reviewing the exact impact and obtaining required approval.
6. Record root cause, remediation, and follow-up tests.

## 12. Current foundation branch boundary

This branch is limited to five documentation files and one read-only Node CI workflow. It does not add credentials, provider activation, runtime agent execution, database access, migrations, deployment configuration, or automatic merge behavior.
