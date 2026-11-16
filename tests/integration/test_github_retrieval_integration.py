import base64
import hashlib
import json

from iq_core.agents.approval_apply_intent import ApprovalApplyIntent
from iq_core.execution.github_http_transport import GitHubHTTPTransport
from iq_core.execution.github_readonly_adapter import GitHubReadOnlyObjectAdapter
from iq_core.execution.patch_manifest import (
    PatchAction,
    PatchFileEntry,
    build_patch_manifest,
)


BASE = "a" * 40
TREE = "b" * 40
OLD = b"old source"
NEW = b"new source"
OLD_BLOB = hashlib.sha1(b"blob " + str(len(OLD)).encode() + b"\0" + OLD).hexdigest()


class FakeResponse:
    status = 200

    def __init__(self, payload):
        self.body = json.dumps(payload).encode("utf-8")
        self.headers = {
            "Content-Type": "application/json; charset=utf-8",
            "Content-Length": str(len(self.body)),
        }
        self.closed = False

    def read(self, amount=-1):
        return self.body[:amount]

    def close(self):
        self.closed = True


class FakeOpener:
    def __init__(self, responses):
        self.responses = list(responses)
        self.requests = []

    def open(self, request, timeout):
        self.requests.append((request, timeout))
        return self.responses.pop(0)


def make_manifest_and_intent():
    manifest = build_patch_manifest(
        proposal_id="proposal-integration",
        repository_id="repo-1",
        target_branch="fix/infiniteX-foundation-hardening",
        base_commit_sha=BASE,
        files=(
            PatchFileEntry(
                path="src/app.py",
                action=PatchAction.MODIFY,
                content_sha256=hashlib.sha256(NEW).hexdigest(),
                size_bytes=len(NEW),
            ),
        ),
    )
    intent = ApprovalApplyIntent(
        nonce_id="nonce-integration",
        reviewer_subject="reviewer",
        reviewer_role="owner",
        repository_id="repo-1",
        target_branch=manifest.target_branch,
        base_commit_sha=BASE,
        proposal_id=manifest.proposal_id,
        proposal_sha256=manifest.manifest_sha256,
        policy_version="policy-v1",
        file_paths=("src/app.py",),
        issued_at=100,
        expires_at=200,
    )
    return manifest, intent


def test_http_transport_adapter_and_git_verifier_integrate_end_to_end():
    commit_url = f"https://api.github.com/repos/owner/repo/git/commits/{BASE}"
    tree_url = f"https://api.github.com/repos/owner/repo/git/trees/{TREE}?recursive=1"
    blob_url = f"https://api.github.com/repos/owner/repo/git/blobs/{OLD_BLOB}"
    opener = FakeOpener([
        FakeResponse({"sha": BASE, "tree": {"sha": TREE}}),
        FakeResponse({
            "sha": TREE,
            "truncated": False,
            "tree": [{
                "path": "src/app.py",
                "mode": "100644",
                "type": "blob",
                "sha": OLD_BLOB,
            }],
        }),
        FakeResponse({
            "sha": OLD_BLOB,
            "encoding": "base64",
            "content": base64.b64encode(OLD).decode("ascii"),
        }),
    ])
    transport = GitHubHTTPTransport(opener=opener, max_retries=0)
    adapter = GitHubReadOnlyObjectAdapter(
        transport=transport,
        repository_full_name="owner/repo",
        repository_id="repo-1",
    )
    manifest, intent = make_manifest_and_intent()

    report = adapter.retrieve_and_verify(
        manifest=manifest,
        intent=intent,
        proposed_blob_contents={"src/app.py": NEW},
    )

    assert report.valid
    assert report.verified_paths == ("src/app.py",)
    assert report.verified_blob_count == 2
    assert [request.get_method() for request, _ in opener.requests] == ["GET", "GET", "GET"]
    assert [request.full_url for request, _ in opener.requests] == [
        commit_url, tree_url, blob_url,
    ]
    assert all(timeout <= 30 for _, timeout in opener.requests)


def test_integration_fails_closed_when_recursive_tree_is_truncated():
    commit_url = f"https://api.github.com/repos/owner/repo/git/commits/{BASE}"
    tree_url = f"https://api.github.com/repos/owner/repo/git/trees/{TREE}?recursive=1"
    opener = FakeOpener([
        FakeResponse({"sha": BASE, "tree": {"sha": TREE}}),
        FakeResponse({"sha": TREE, "truncated": True, "tree": []}),
    ])
    adapter = GitHubReadOnlyObjectAdapter(
        transport=GitHubHTTPTransport(opener=opener, max_retries=0),
        repository_full_name="owner/repo",
        repository_id="repo-1",
    )
    manifest, intent = make_manifest_and_intent()

    from iq_core.execution.github_readonly_adapter import GitHubReadError
    import pytest

    with pytest.raises(GitHubReadError, match="TRUNCATED"):
        adapter.retrieve_and_verify(
            manifest=manifest,
            intent=intent,
            proposed_blob_contents={"src/app.py": NEW},
        )
    assert len(opener.requests) == 2
