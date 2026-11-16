"""Strict input contracts for trusted proposal registration."""
from __future__ import annotations

import re
from pathlib import PurePosixPath
from pydantic import BaseModel, ConfigDict, Field, field_validator

_SHA_RE = re.compile(r"^[0-9a-f]{40}$")
_REPO_RE = re.compile(r"^[A-Za-z0-9_.-]{1,100}/[A-Za-z0-9_.-]{1,100}$")


class ProposalFileInput(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    path: str = Field(min_length=1, max_length=500)
    content: str = Field(max_length=200_000)

    @field_validator("path")
    @classmethod
    def validate_path(cls, value: str) -> str:
        if "\\\\" in value or value.startswith("/") or "\\x00" in value:
            raise ValueError("path must be a relative POSIX path")
        path = PurePosixPath(value)
        if str(path) != value or any(part in {".", ".."} for part in path.parts):
            raise ValueError("path traversal or non-canonical path is forbidden")
        if not path.parts or path.parts[0] == ".git":
            raise ValueError("repository control paths are forbidden")
        if path.parts[:2] == (".github", "workflows"):
            raise ValueError("workflow changes require a separate privileged process")
        lowered = value.lower()
        if any(part == "secrets" for part in path.parts) or lowered.endswith((".pem", ".key", ".p12", ".pfx")):
            raise ValueError("sensitive file paths are forbidden")
        if path.name in {".env", ".env.local", ".env.production"} or path.name.startswith(".env."):
            raise ValueError("environment files are forbidden")
        return value


class TrustedProposalCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    proposal_id: str = Field(min_length=1, max_length=100, pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]*$")
    repository_id: int = Field(gt=0)
    repository_full_name: str = Field(min_length=3, max_length=201)
    target_branch: str = Field(min_length=1, max_length=255)
    base_commit_sha: str = Field(pattern=_SHA_RE.pattern)
    policy_version: str = Field(min_length=1, max_length=64)
    files: tuple[ProposalFileInput, ...] = Field(min_length=1, max_length=20)

    @field_validator("repository_full_name")
    @classmethod
    def validate_repository(cls, value: str) -> str:
        if not _REPO_RE.fullmatch(value):
            raise ValueError("repository_full_name must use owner/repository format")
        return value

    @field_validator("target_branch")
    @classmethod
    def validate_branch(cls, value: str) -> str:
        if value != value.strip() or any(c.isspace() for c in value) or ".." in value or value.startswith("-"):
            raise ValueError("target_branch is not a canonical Git branch name")
        return value

    @field_validator("files")
    @classmethod
    def unique_paths(cls, value: tuple[ProposalFileInput, ...]) -> tuple[ProposalFileInput, ...]:
        paths = [item.path for item in value]
        if len(paths) != len(set(paths)):
            raise ValueError("proposal contains duplicate file paths")
        if sum(len(item.content.encode("utf-8")) for item in value) > 1_000_000:
            raise ValueError("proposal exceeds the 1 MB total content limit")
        return value
