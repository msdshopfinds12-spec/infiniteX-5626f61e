import pytest
from pydantic import ValidationError

from backend.app.proposals.schemas import TrustedProposalCreate


def valid_payload(**overrides):
    data = {
        "proposal_id": "proposal-1", "repository_id": 42,
        "repository_full_name": "owner/repo", "target_branch": "fix/example",
        "base_commit_sha": "a" * 40, "policy_version": "trusted-proposal-policy/1",
        "files": [{"path": "src/app.py", "content": "print('safe')\n"}],
    }
    return data | overrides


def test_valid_proposal_schema_accepts_exact_repository_and_manifest():
    item = TrustedProposalCreate.model_validate(valid_payload())
    assert item.repository_id == 42
    assert item.files[0].path == "src/app.py"


@pytest.mark.parametrize("path", [
    "../escape.py", "/absolute.py", "a\\b.py", ".git/config",
    ".github/workflows/ci.yml", ".env", "keys/private.pem",
])
def test_schema_rejects_unsafe_paths(path):
    with pytest.raises(ValidationError):
        TrustedProposalCreate.model_validate(valid_payload(files=[{"path": path, "content": "x"}]))


def test_schema_rejects_duplicate_paths_and_unknown_fields():
    files = [{"path": "a.py", "content": "1"}, {"path": "a.py", "content": "2"}]
    with pytest.raises(ValidationError):
        TrustedProposalCreate.model_validate(valid_payload(files=files))
    with pytest.raises(ValidationError):
        TrustedProposalCreate.model_validate(valid_payload(untrusted_approval=True))


def test_schema_rejects_invalid_commit_and_repository_identity():
    with pytest.raises(ValidationError):
        TrustedProposalCreate.model_validate(valid_payload(base_commit_sha="not-a-sha"))
    with pytest.raises(ValidationError):
        TrustedProposalCreate.model_validate(valid_payload(repository_full_name="https://evil.invalid/owner/repo"))
