import pytest

from backend.app.proposals.fingerprint import proposal_fingerprint

BASE = dict(
    tenant_id="11111111-1111-4111-8111-111111111111",
    proposal_id="proposal-1", repository_id=42,
    repository_full_name="owner/repo", target_branch="fix/example",
    base_commit_sha="a" * 40,
    files=[{"path": "src/a.py", "sha256": "b" * 64, "byte_length": 12}],
    policy_version="trusted-proposal-policy/1",
)


def test_fingerprint_is_deterministic_and_manifest_order_independent():
    files = [
        {"path": "z.py", "sha256": "c" * 64, "byte_length": 2},
        {"path": "a.py", "sha256": "d" * 64, "byte_length": 3},
    ]
    assert proposal_fingerprint(**(BASE | {"files": files})) == proposal_fingerprint(**(BASE | {"files": list(reversed(files))}))


@pytest.mark.parametrize("field,value", [
    ("tenant_id", "22222222-2222-4222-8222-222222222222"),
    ("proposal_id", "proposal-2"), ("repository_id", 43),
    ("repository_full_name", "other/repo"), ("target_branch", "fix/other"),
    ("base_commit_sha", "c" * 40), ("policy_version", "policy/2"),
])
def test_fingerprint_binds_every_trusted_identity_field(field, value):
    assert proposal_fingerprint(**(BASE | {field: value})) != proposal_fingerprint(**BASE)


def test_fingerprint_binds_manifest_path_content_digest_and_size():
    changed = [dict(BASE["files"][0], sha256="e" * 64)]
    assert proposal_fingerprint(**(BASE | {"files": changed})) != proposal_fingerprint(**BASE)
    changed = [dict(BASE["files"][0], byte_length=13)]
    assert proposal_fingerprint(**(BASE | {"files": changed})) != proposal_fingerprint(**BASE)
    changed = [dict(BASE["files"][0], path="src/b.py")]
    assert proposal_fingerprint(**(BASE | {"files": changed})) != proposal_fingerprint(**BASE)


def test_fingerprint_rejects_duplicate_paths_and_bad_digest():
    duplicate = BASE["files"] * 2
    with pytest.raises(ValueError, match="duplicate"):
        proposal_fingerprint(**(BASE | {"files": duplicate}))
    with pytest.raises(ValueError, match="sha256"):
        proposal_fingerprint(**(BASE | {"files": [{"path":"a", "sha256":"BAD", "byte_length":1}]}))
