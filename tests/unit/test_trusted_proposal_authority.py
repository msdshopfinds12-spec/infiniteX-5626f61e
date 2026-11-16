import pytest
from backend.app.proposals.authority import VerifiedRepositorySnapshot, assert_snapshot_matches_request

SNAPSHOT = VerifiedRepositorySnapshot(42, "owner/repo", "fix/example", "a" * 40)
REQUEST = {"repository_id":42, "repository_full_name":"owner/repo",
           "target_branch":"fix/example", "base_commit_sha":"a" * 40}

def test_authoritative_snapshot_matches_all_bindings():
    assert_snapshot_matches_request(requested=REQUEST, verified=SNAPSHOT)

@pytest.mark.parametrize("key,value", [
    ("repository_id",43), ("repository_full_name","attacker/repo"),
    ("target_branch","main"), ("base_commit_sha","b" * 40),
])
def test_authority_mismatch_fails_closed(key, value):
    with pytest.raises(ValueError, match="authority mismatch"):
        assert_snapshot_matches_request(requested=REQUEST | {key:value}, verified=SNAPSHOT)
