# Git Object Verification Engine

## Purpose
A pure, fail-closed validation boundary between an approved patch manifest and
Git object data. It does not fetch objects, write Git objects, apply patches,
run commands, or update refs.

## Required trusted adapter behavior
1. Resolve the exact approved base commit SHA; never substitute a branch tip.
2. Fetch its recursive Git tree and reject the response if GitHub reports
   `truncated: true`. For repositories whose tree exceeds API response limits,
   use a trusted paginated/iterative tree walk and prove completeness.
3. Convert tree records into `GitTreeEntry` values without normalizing paths.
4. For each touched existing path, fetch the referenced blob and decode the
   exact raw bytes. Verify base blob SHA-1 using Git's `blob <length>\\0`
   object header.
5. Supply proposed raw bytes only for manifest ADD/MODIFY paths.
6. Call `verify_git_snapshot`; reject every non-empty error list.

## Enforced invariants
- ADD paths must be absent from the approved base tree.
- MODIFY and DELETE paths must exist in the approved base tree.
- Only regular Git blobs with modes 100644 or 100755 are accepted.
- Symlink mode 120000, submodule mode 160000, trees, and other modes fail closed.
- Base bytes must match the Git tree blob SHA-1.
- Proposed bytes must match manifest byte size and SHA-256.
- Base/proposed blob maps must contain exactly the required paths.
- Tree truncation, duplicate/case-colliding paths, manifest scope errors, and
  object tampering invalidate the report.

## Remaining production work
This module is not a GitHub adapter and does not prove the caller fetched the
correct tree or all objects. Production integration still needs authenticated
read-only Git object retrieval, completeness guarantees, response-size limits,
timeouts, retry policy, rate-limit handling, and independent adapter tests.
A separate reviewed apply worker and human approval gate remain mandatory.
