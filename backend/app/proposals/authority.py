"""Server-side repository snapshot authority contract."""
from __future__ import annotations
from dataclasses import dataclass
from typing import Protocol

@dataclass(frozen=True)
class VerifiedRepositorySnapshot:
    repository_id: int
    repository_full_name: str
    target_branch: str
    base_commit_sha: str

class RepositorySnapshotAuthority(Protocol):
    def resolve_snapshot(self, *, repository_id: int, repository_full_name: str,
                         target_branch: str, base_commit_sha: str) -> VerifiedRepositorySnapshot:
        """Resolve all facts through authenticated server-side Git credentials."""
        ...

def assert_snapshot_matches_request(*, requested: dict[str, object],
                                    verified: VerifiedRepositorySnapshot) -> None:
    expected = (
        ("repository_id", verified.repository_id),
        ("repository_full_name", verified.repository_full_name),
        ("target_branch", verified.target_branch),
        ("base_commit_sha", verified.base_commit_sha),
    )
    for key, trusted_value in expected:
        if requested.get(key) != trusted_value:
            raise ValueError(f"repository authority mismatch: {key}")
