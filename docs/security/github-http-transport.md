# Production Read-Only GitHub HTTP Transport

## Scope

`GitHubHTTPTransport` implements the `ReadOnlyGitHubTransport.get_json(url)`
protocol consumed by `GitHubReadOnlyObjectAdapter`. It exposes one operation only:
HTTPS GET to allowlisted GitHub REST repository endpoints. It has no POST, PATCH,
PUT, DELETE, subprocess, ref-update, or patch-application method.

## Controls

- Exact HTTPS origin allowlist: `api.github.com`.
- Repository API paths only; only the empty query or `recursive=1` is accepted.
- Redirects are rejected, preventing credential forwarding to another host.
- Connect/read timeout is bounded to 30 seconds (default 10 seconds).
- Response bytes are bounded (default 6 MB, maximum 10 MB); reads request at most
  limit + 1 bytes to detect overflow.
- JSON content type, UTF-8, and object shape are mandatory.
- Optional credential provider is injected; token values are never included in
  raised error messages or logs (this module does not log).
- 429 and explicit 403 rate-limit responses receive finite retries only.
- Retry-After is capped at 30 seconds; retry count is capped at 3.
- HTTP errors are mapped to sanitized error codes.

## Credential policy

Use a fine-grained GitHub token or GitHub App installation token with Contents: Read
for the one target repository only. Supply it at runtime through a secret manager or
environment-backed provider. Never commit credentials, print them, return them in
API responses, or store them in audit metadata. Public repository access may omit a
token. Rotate credentials if exposure is suspected.

## Wiring

Construct `GitHubHTTPTransport(token_provider=...)` and inject it into
`GitHubReadOnlyObjectAdapter(transport=..., repository_full_name=...,
repository_id=...)`. The repository ID must be obtained from trusted GitHub repository
metadata and match the ID bound into the signed approval intent.

## Important limitations

- The HTTP transport and its tests are authored here but have not been executed in
  this repository environment.
- No live token provider, secret manager, GitHub App installation flow, or deployment
  configuration is created.
- The transport does not itself establish human identity or approval authority.
- The adapter still fails closed on truncated recursive trees. A separate verified
  subtree traversal implementation is needed for repositories whose tree response is
  truncated.
- This remains read-only retrieval. It does not apply proposed code or execute it.

## Verification required before production use

Run the complete Python test suite and Ruff. Add a controlled integration test against
a dedicated test repository using a least-privilege read-only credential. Confirm
timeouts, rate limits, oversized bodies, redirects, and secret redaction. Review
credential lifecycle and monitoring before any live integration.
