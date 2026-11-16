# GitHub Retrieval + Verification Integration

## Integrated path

`GitHubHTTPTransport` → `GitHubReadOnlyObjectAdapter` →
`verify_git_snapshot`.

The integration test injects a fake HTTP opener into the production transport,
then exercises commit metadata, recursive tree retrieval, base blob retrieval,
Git blob SHA-1 validation, and proposed-content SHA-256 validation. It asserts
that every request uses GET and the expected exact GitHub API URL.

## Additional URL hardening

The HTTP transport now accepts only exact Git object endpoints for commits, trees,
and blobs. The only query string allowed is `recursive=1` on a tree endpoint.
Encoded path delimiters, arbitrary repository subpaths, arbitrary query strings,
non-HTTPS origins, credentials in URLs, and fragments are rejected.

## Verification status

The tests are authored but not executed by this GitHub file-commit workflow.
Run `python -m pytest -q tests/unit/test_github_http_transport.py
tests/unit/test_github_readonly_adapter.py tests/integration/test_github_retrieval_integration.py`
and `python -m ruff check iq_core/execution tests/unit tests/integration`
in a controlled environment before treating this integration as verified.

No repository writes, patch application, shell execution, or deployment are part
of this integration.
