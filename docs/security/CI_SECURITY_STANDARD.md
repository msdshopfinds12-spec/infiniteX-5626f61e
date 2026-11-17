# CI Security Standard

**Scope:** GitHub Actions workflow policy for the InfiniteX repository.

**Status:** Implemented on the isolated `security/phase-3d-4l-regression` branch; CI execution is pending until GitHub Actions runs.

## Security invariants

1. Workflows declare an explicit top-level `permissions` mapping.
2. Every job declares its own explicit `permissions` mapping. Only `read` and `none` are accepted by this baseline; any write permission requires a separately reviewed policy change.
3. `pull_request_target` is prohibited. Use `pull_request` for untrusted contributions and keep those jobs read-only.
4. Every job has a finite `timeout-minutes` between 1 and 60.
5. Third-party actions use a full 40-character commit SHA. Local actions may use a repository-relative `./` path without parent-directory traversal.
6. Every `actions/checkout` step explicitly sets `persist-credentials: false`.
7. Shell `run` blocks must not interpolate untrusted GitHub event/ref/actor context expressions directly.
8. Shell `run` blocks must not interpolate `${{ secrets.* }}` directly. If a secret is legitimately required in a trusted workflow, scope it to the smallest step through `env`, never print it, and keep the job off untrusted pull-request execution.
9. YAML is parsed structurally with duplicate-key rejection and bounded alias expansion. Invalid YAML or unknown workflow shapes fail closed.

## Developer commands

```sh
npm ci
npm run check:ci-policy
npm run test:ci-policy
npm audit --audit-level=moderate
```

The policy test suite includes secure YAML fixtures and negative regression cases for malformed YAML, duplicate keys, `pull_request_target`, write permissions, missing job permissions, invalid timeouts, mutable action tags, checkout credential persistence, untrusted shell interpolation, and direct secret interpolation.

## Handling untrusted pull-request data

Do not write expressions such as `${{ github.event.pull_request.title }}` directly inside a shell command. If a workflow genuinely needs user-controlled metadata, pass it through a narrowly scoped environment variable and quote the variable at the point of use. Validate its expected format and length before passing it to another program. Avoid evaluating user-controlled strings as code.

## Review requirements for exceptions

A proposed exception must include:
- the exact workflow, job, permission, and action requiring the exception;
- why a read-only alternative is insufficient;
- the minimum permission and duration;
- the trust boundary and threat model;
- tests proving the exception does not expose secrets to untrusted code;
- explicit human approval before merging.

## Known limitations

This scanner is a repository-specific guardrail, not a complete GitHub Actions semantic analyzer. It does not replace GitHub's workflow validation, `actionlint`, dependency review, secret scanning, CodeQL, branch protection, or human review. It does not prove that a secret passed through `env` is never logged, nor does it verify the runtime behavior of third-party actions. Keep those controls as separate layers.

The policy deliberately favors false positives over silently permitting write access. Expand it only with a regression test and documented review.
