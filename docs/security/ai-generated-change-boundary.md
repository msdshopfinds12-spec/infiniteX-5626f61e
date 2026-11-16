# AI-Generated Change Security Boundary

**Status: Guardrail module added; runtime sandbox and end-to-end authorization verification pending.**

## Non-negotiable rules

1. Model output is untrusted data, never executable authority.
2. Generated changes cannot approve themselves or change approval policy.
3. The proposal engine has no GitHub write token, deployment credential, database credential or production secret.
4. The initial policy rejects deletions and changes to GitHub workflows, migrations, environment files, dependency lockfiles, credentials and keys.
5. Proposals are bound to an exact base commit SHA. A changed base requires a new proposal and review.
6. The validator does not apply patches, execute commands, import generated modules or contact the network.
7. Test workers run in disposable, least-privilege environments with explicit CPU, memory, time and filesystem limits.
8. Human approval is bound to a content digest and exact operation scope. Any diff change invalidates approval.
9. Merge, migration and deployment permissions are separate from patch-generation permissions.
10. All policy decisions are recorded without logging secrets.

## Current implementation

`iq_core/engineering_guardrails` provides deterministic validation for proposal IDs, commit SHA format, duplicate paths, allowed roots, file extensions, protected paths, deletion operations and content-size limits.

## Known gaps

- The validator is not yet wired into the API or agent orchestration.
- No isolated execution service is implemented by this change.
- No persistent approval or audit database schema is introduced.
- No GitHub Actions rerun, migration, PR, merge or deployment is authorized by this document.
- File-path checks do not replace filesystem-level symlink defenses in a future patch applier.

## Required next verification

Run unit tests and Ruff on the exact branch commit; review the final diff; then design the isolated worker and approval persistence as separately reviewed increments.
