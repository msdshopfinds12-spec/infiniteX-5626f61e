import io
import json
import urllib.error

import pytest

from iq_core.execution.github_http_transport import (
    GitHubHTTPTransport,
    GitHubTransportError,
)


URL = "https://api.github.com/repos/owner/repo/git/commits/" + "a" * 40


class FakeResponse:
    status = 200

    def __init__(self, payload, headers=None):
        self._body = payload if isinstance(payload, bytes) else json.dumps(payload).encode()
        self.headers = headers or {"Content-Type": "application/json"}
        self.closed = False
        self.read_limit = None

    def read(self, amount=-1):
        self.read_limit = amount
        return self._body[:amount]

    def close(self):
        self.closed = True


class FakeOpener:
    def __init__(self, outcomes):
        self.outcomes = list(outcomes)
        self.requests = []
        self.timeouts = []

    def open(self, request, timeout):
        self.requests.append(request)
        self.timeouts.append(timeout)
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


def test_get_json_sends_get_and_never_exposes_token():
    response = FakeResponse({"sha": "a" * 40})
    opener = FakeOpener([response])
    transport = GitHubHTTPTransport(
        token_provider=lambda: "test-token",
        opener=opener,
    )
    assert transport.get_json(URL)["sha"] == "a" * 40
    request = opener.requests[0]
    assert request.get_method() == "GET"
    assert request.get_header("Authorization") == "Bearer test-token"
    assert response.closed


@pytest.mark.parametrize("url", [
    "http://api.github.com/repos/owner/repo",
    "https://evil.example/repos/owner/repo",
    "https://api.github.com.evil.example/repos/owner/repo",
    "https://user:pass@api.github.com/repos/owner/repo",
    "https://api.github.com/repos/owner/repo?per_page=999",
    "https://api.github.com/repos/owner/repo#fragment",
])
def test_rejects_non_allowlisted_urls(url):
    transport = GitHubHTTPTransport(opener=FakeOpener([]))
    with pytest.raises(GitHubTransportError):
        transport.get_json(url)


def test_rejects_oversized_response():
    response = FakeResponse(b'{"data":"' + b"x" * 128 + b'"}')
    transport = GitHubHTTPTransport(
        opener=FakeOpener([response]),
        max_response_bytes=32,
    )
    with pytest.raises(GitHubTransportError, match="SIZE_LIMIT"):
        transport.get_json(URL)
    assert response.read_limit == 33
    assert response.closed


def test_rejects_non_json_and_invalid_json():
    html = FakeResponse(b"<html/>", {"Content-Type": "text/html"})
    transport = GitHubHTTPTransport(opener=FakeOpener([html]))
    with pytest.raises(GitHubTransportError, match="CONTENT_TYPE"):
        transport.get_json(URL)

    invalid = FakeResponse(b"{", {"Content-Type": "application/json"})
    transport = GitHubHTTPTransport(opener=FakeOpener([invalid]))
    with pytest.raises(GitHubTransportError, match="JSON_RESPONSE_INVALID"):
        transport.get_json(URL)


def test_retries_rate_limit_with_bounded_retry_after():
    error = urllib.error.HTTPError(
        URL, 429, "limited", {"Retry-After": "99"}, io.BytesIO(b""),
    )
    response = FakeResponse({"ok": True})
    opener = FakeOpener([error, response])
    sleeps = []
    transport = GitHubHTTPTransport(
        opener=opener,
        max_retries=1,
        sleep=sleeps.append,
    )
    assert transport.get_json(URL) == {"ok": True}
    assert sleeps == [30.0]
    assert len(opener.requests) == 2


def test_does_not_retry_non_rate_limit_forbidden():
    error = urllib.error.HTTPError(URL, 403, "forbidden", {}, io.BytesIO(b""))
    transport = GitHubHTTPTransport(opener=FakeOpener([error]), max_retries=2)
    with pytest.raises(GitHubTransportError, match="FORBIDDEN"):
        transport.get_json(URL)


def test_rejects_redirects():
    error = urllib.error.HTTPError(URL, 302, "redirect", {"Location": "https://evil.example"}, io.BytesIO(b""))
    transport = GitHubHTTPTransport(opener=FakeOpener([error]))
    with pytest.raises(GitHubTransportError, match="REDIRECT_REJECTED"):
        transport.get_json(URL)


def test_constructor_rejects_unbounded_limits():
    with pytest.raises(ValueError):
        GitHubHTTPTransport(timeout_seconds=1000)
    with pytest.raises(ValueError):
        GitHubHTTPTransport(max_retries=100)


@pytest.mark.parametrize("url", [
    "https://api.github.com/repos/owner/repo/git/commits/" + "a" * 40 + "/extra",
    "https://api.github.com/repos/owner/repo/git/commits/%2e%2e",
    "https://api.github.com/repos/owner/repo/git/blobs/" + "a" * 40 + "?recursive=1",
    "https://api.github.com/repos/owner/repo/contents/file",
])
def test_rejects_paths_outside_exact_git_object_endpoints(url):
    transport = GitHubHTTPTransport(opener=FakeOpener([]))
    with pytest.raises(GitHubTransportError):
        transport.get_json(url)

def test_rejects_dot_segment_repository_names():
    transport = GitHubHTTPTransport(opener=FakeOpener([]))
    for owner, name in [(".", "repo"), ("..", "repo"), ("owner", "..")]:
        url = f"https://api.github.com/repos/{owner}/{name}/git/commits/" + "a" * 40
        with pytest.raises(GitHubTransportError):
            transport.get_json(url)
