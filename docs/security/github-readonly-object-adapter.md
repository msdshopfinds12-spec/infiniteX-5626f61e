# Read-Only GitHub Object Retrieval Adapter

## Purpose

This milestone adds a transport-injected, GET-only adapter that retrieves an exact
Git commit, its recursive tree, and the raw contents of touched regular-file blobs.
It passes the retrieved snapshot to the existing Git Object Verification Engine.
It does not create blobs, trees, commits, refs, branches, patches, or pull requests.

## Trust and data flow

1. Validate the repository identifier and the exact 40-character base commit SHA.
2. Fetch `GET /git/commits/{sha}`; require the returned commit SHA to match.
3. Read the tree SHA from that commit object.
4. Fetch `GET /git/trees/{tree_sha}?recursive=1`.
5. Require the tree SHA to match and `truncated` to be exactly false.
6. Validate every tree entry and reject duplicate/case-colliding paths.
7. Fetch only touched existing regular blobs through `GET /git/blobs/{sha}`.
8. Strictly Base64-decode raw bytes and recompute the canonical Git blob SHA-1.
9. Pass the complete tree and touched raw bytes to `verify_git_snapshot`.

## Fail-closed behavior

The adapter rejects malformed commit/tree/blob payloads, SHA mismatches, truncated or
unconfirmed trees, unsupported blob encodings, malformed Base64, oversized blobs,
oversized aggregate blob data, duplicate paths, and non-allowlisted API hosts.
Symlink, submodule, and other non-regular touched entries are left visible to the
pure verifier, which rejects their Git modes/types.

## Production transport requirements

`ReadOnlyGitHubTransport` is intentionally narrow: it exposes only `get_json(url)`.
A production implementation must:
- use a narrowly scoped GitHub credential with repository read-only permissions;
- allow only HTTPS requests to `api.github.com` and GET;
- set connection/read timeouts and bounded response sizes;
- handle 403/429 rate limits with bounded backoff and respect Retry-After;
- reject redirects to unapproved hosts;
- never log authorization headers, tokens, or raw secret values;
- validate the JSON response shape before returning it;
- avoid caching across repositories or commit SHAs unless cache keys include both.

The adapter receives both the API repository name and a separately configured stable
repository ID. The stable ID must come from trusted repository metadata/configuration
and must match the repository ID in the signed approval intent; a display name is not
a substitute. The current repository adapter does not implement an HTTP client, credential storage,
retry policy, or live MCP bridge. The caller must inject a reviewed transport. The
ChatGPT GitHub connector's read tools are not automatically callable from this Python
module; connector orchestration remains a separate integration task.

## Known limitations

- GitHub API JSON tree responses are subject to service limits; truncated trees fail
  closed. A future adapter may implement recursive subtree traversal with completeness
  proofs, but must not silently accept partial results.
- The adapter fetches raw Git blobs only for touched existing regular files.
- It validates object hashes but does not prove that the GitHub account/credential is
  the intended human identity; approval verification and repository identity binding
  remain separate controls.
- No production apply worker, durable nonce store, patch writer, sandbox runner, or
  human approval UI is implemented here.
- Tests are authored but must be executed in the repository environment before this
  milestone can be marked tested.

## Security boundary

This module is read-only by design. Any future patch application must be a separate
worker that consumes a persisted, single-use approval intent, rechecks the pinned base
commit and manifest, runs in an isolated no-network/no-credentials sandbox, emits
append-only audit events, and requires a new explicit human release approval.
