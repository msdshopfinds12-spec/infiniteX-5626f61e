import base64
import hashlib

import pytest

from iq_core.execution.github_readonly_adapter import (
    GitHubReadError,
    GitHubReadOnlyObjectAdapter,
)


BASE = "a" * 40
TREE = "b" * 40
CONTENT = b"old contents"
BLOB = hashlib.sha1(b"blob " + str(len(CONTENT)).encode() + b"\0" + CONTENT).hexdigest()


class FakeTransport:
    def __init__(self, responses):
        self.responses = responses
        self.urls = []

    def get_json(self, url):
        self.urls.append(url)
        if url not in self.responses:
            raise AssertionError(f"Unexpected GET: {url}")
        return self.responses[url]


def make_adapter(responses):
    transport = FakeTransport(responses)
    adapter = GitHubReadOnlyObjectAdapter(
        transport=transport,
        repository_full_name="owner/repo",
        repository_id="repo-1",
    )
    return adapter, transport


def responses(*, truncated=False, blob_content=CONTENT, blob_sha=BLOB):
    commit_url = f"https://api.github.com/repos/owner/repo/git/commits/{BASE}"
    tree_url = f"https://api.github.com/repos/owner/repo/git/trees/{TREE}?recursive=1"
    blob_url = f"https://api.github.com/repos/owner/repo/git/blobs/{BLOB}"
    return {
        commit_url: {"sha": BASE, "tree": {"sha": TREE}},
        tree_url: {
            "sha": TREE,
            "truncated": truncated,
            "tree": [{
                "path": "src/app.py",
                "mode": "100644",
                "type": "blob",
                "sha": BLOB,
            }],
        },
        blob_url: {
            "sha": blob_sha,
            "encoding": "base64",
            "content": base64.b64encode(blob_content).decode("ascii"),
        },
    }


def test_retrieves_exact_commit_tree_and_verifies_raw_blob_hash():
    adapter, transport = make_adapter(responses())
    snapshot = adapter.retrieve_snapshot(
        base_commit_sha=BASE,
        paths=("src/app.py",),
    )
    assert snapshot.commit_sha == BASE
    assert snapshot.tree_sha == TREE
    assert snapshot.base_blob_contents == {"src/app.py": CONTENT}
    assert len(transport.urls) == 3
    assert all(url.startswith("https://api.github.com/") for url in transport.urls)


def test_rejects_truncated_recursive_tree_before_blob_fetch():
    adapter, transport = make_adapter(responses(truncated=True))
    with pytest.raises(GitHubReadError, match="TRUNCATED"):
        adapter.retrieve_snapshot(base_commit_sha=BASE, paths=("src/app.py",))
    assert len(transport.urls) == 2


def test_rejects_commit_sha_mismatch():
    data = responses()
    commit_url = f"https://api.github.com/repos/owner/repo/git/commits/{BASE}"
    data[commit_url] = {"sha": "c" * 40, "tree": {"sha": TREE}}
    adapter, _ = make_adapter(data)
    with pytest.raises(GitHubReadError, match="COMMIT_SHA_MISMATCH"):
        adapter.retrieve_snapshot(base_commit_sha=BASE, paths=("src/app.py",))


def test_rejects_blob_hash_mismatch():
    data = responses(blob_content=b"tampered")
    adapter, _ = make_adapter(data)
    with pytest.raises(GitHubReadError, match="OBJECT_HASH_MISMATCH"):
        adapter.retrieve_snapshot(base_commit_sha=BASE, paths=("src/app.py",))


def test_rejects_duplicate_case_colliding_tree_paths():
    data = responses()
    tree_url = f"https://api.github.com/repos/owner/repo/git/trees/{TREE}?recursive=1"
    data[tree_url]["tree"].append({
        "path": "SRC/APP.PY",
        "mode": "100644",
        "type": "blob",
        "sha": BLOB,
    })
    adapter, _ = make_adapter(data)
    with pytest.raises(GitHubReadError, match="DUPLICATE_OR_CASE_COLLISION"):
        adapter.retrieve_snapshot(base_commit_sha=BASE, paths=("src/app.py",))


def test_rejects_unsupported_blob_encoding():
    data = responses()
    blob_url = f"https://api.github.com/repos/owner/repo/git/blobs/{BLOB}"
    data[blob_url]["encoding"] = "utf-8"
    adapter, _ = make_adapter(data)
    with pytest.raises(GitHubReadError, match="ENCODING_UNSUPPORTED"):
        adapter.retrieve_snapshot(base_commit_sha=BASE, paths=("src/app.py",))


def test_rejects_invalid_repository_and_unapproved_api_host():
    transport = FakeTransport({})
    with pytest.raises(ValueError, match="REPOSITORY_NAME_INVALID"):
        GitHubReadOnlyObjectAdapter(transport=transport, repository_full_name="../repo", repository_id="repo-1")
    with pytest.raises(ValueError, match="API_BASE_URL_NOT_ALLOWLISTED"):
        GitHubReadOnlyObjectAdapter(
            transport=transport,
            repository_full_name="owner/repo",
            repository_id="repo-1",
            api_base_url="https://example.invalid",
        )
