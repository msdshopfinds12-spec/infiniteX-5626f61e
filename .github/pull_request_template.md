## Change summary

Describe the user-visible and engineering changes. Link the related issue or phase.

## Engineering evidence

- [ ] Scope is limited to the approved branch and files.
- [ ] No secrets, tokens, private keys, or production data are included.
- [ ] Dependencies are necessary and lockfile changes are intentional.
- [ ] Database changes include a verified schema, forward migration, rollback/restore plan, and synthetic integration tests.
- [ ] AI-generated suggestions were reviewed; no generated code is treated as trusted without validation.

## Verification

- [ ] Typecheck / lint passed.
- [ ] Unit tests passed.
- [ ] Dependency audit passed or documented findings were reviewed.
- [ ] Production build passed.
- [ ] Browser / accessibility tests passed when UI behavior changed.
- [ ] Security-sensitive changes include negative tests and fail-closed behavior.
- [ ] CI checks are green on the exact head commit.

**Evidence links / command output:**

<!-- Add workflow run links and explain any skipped or blocked checks. -->

## Risk and rollback

**Risk level:** Low / Medium / High

**Known limitations:**

**Rollback or recovery plan:**

## Release gate

- [ ] No production deployment is implied by this PR.
- [ ] Human approval obtained before merge.
- [ ] Human approval obtained separately before production deployment or migration.
