"""Typed, execution-free contracts for proposed repository changes."""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum


class ChangeOperation(StrEnum):
    CREATE = "create"
    UPDATE = "update"
    DELETE = "delete"


@dataclass(frozen=True, slots=True)
class FileChange:
    path: str
    operation: ChangeOperation
    content: str


@dataclass(frozen=True, slots=True)
class PatchProposal:
    proposal_id: str
    base_commit: str
    changes: tuple[FileChange, ...]


@dataclass(frozen=True, slots=True)
class ValidationResult:
    accepted: bool
    reasons: tuple[str, ...]
    file_count: int
    total_bytes: int
