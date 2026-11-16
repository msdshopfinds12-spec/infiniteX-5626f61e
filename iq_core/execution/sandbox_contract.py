"""Fail-closed contract for isolated, human-authorized code validation.

This module defines profiles and an execution port only. It ships no shell
runner, container launcher, network client, or host-process adapter.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Protocol
from uuid import uuid4

from iq_core.agents.approval_apply_intent import ApprovalApplyIntent


class SandboxProfile(str, Enum):
    """Fixed commands; callers cannot submit arbitrary shell strings."""

    PYTHON_UNIT_TESTS = "python-unit-tests"
    PYTHON_LINT = "python-lint"
    FRONTEND_TESTS = "frontend-tests"
    FRONTEND_BUILD = "frontend-build"


PROFILE_ARGV: dict[SandboxProfile, tuple[str, ...]] = {
    SandboxProfile.PYTHON_UNIT_TESTS: ("python", "-m", "pytest", "-q"),
    SandboxProfile.PYTHON_LINT: ("python", "-m", "ruff", "check", "."),
    SandboxProfile.FRONTEND_TESTS: ("npm", "test", "--", "--run"),
    SandboxProfile.FRONTEND_BUILD: ("npm", "run", "build"),
}


@dataclass(frozen=True)
class SandboxLimits:
    """Resource and isolation requirements; not merely advisory settings."""

    timeout_seconds: int = 300
    memory_mb: int = 1024
    cpu_count: int = 1
    network_access: bool = False
    credential_access: bool = False
    root_filesystem_read_only: bool = True
    workspace_write_access: bool = True

    def __post_init__(self) -> None:
        if isinstance(self.timeout_seconds, bool) or not 1 <= self.timeout_seconds <= 900:
            raise ValueError("SANDBOX_TIMEOUT_OUT_OF_RANGE")
        if isinstance(self.memory_mb, bool) or not 128 <= self.memory_mb <= 4096:
            raise ValueError("SANDBOX_MEMORY_OUT_OF_RANGE")
        if isinstance(self.cpu_count, bool) or not 1 <= self.cpu_count <= 4:
            raise ValueError("SANDBOX_CPU_OUT_OF_RANGE")
        if self.network_access is not False:
            raise ValueError("SANDBOX_NETWORK_MUST_BE_DISABLED")
        if self.credential_access is not False:
            raise ValueError("SANDBOX_CREDENTIALS_MUST_BE_UNAVAILABLE")
        if self.root_filesystem_read_only is not True:
            raise ValueError("SANDBOX_ROOT_FILESYSTEM_MUST_BE_READ_ONLY")
        if self.workspace_write_access is not True:
            raise ValueError("SANDBOX_WORKSPACE_MUST_BE_WRITABLE")


@dataclass(frozen=True)
class SandboxExecutionRequest:
    """A bounded validation request tied to a previously persisted approval."""

    execution_id: str
    apply_intent_id: str
    proposal_id: str
    proposal_sha256: str
    repository_id: str
    target_branch: str
    base_commit_sha: str
    workspace_id: str
    profile: SandboxProfile
    allowed_file_paths: tuple[str, ...]
    limits: SandboxLimits

    @classmethod
    def from_persisted_intent(
        cls, *, intent: ApprovalApplyIntent, apply_intent_id: str,
        workspace_id: str, profile: SandboxProfile, now: int,
        limits: SandboxLimits | None = None,
    ) -> "SandboxExecutionRequest":
        """Build a request from a trusted service's persisted intent lookup.

        The caller must load the intent from durable storage after approval
        verification and atomic nonce consumption. This factory does not
        authenticate, persist, or consume approval evidence.
        """
        if not isinstance(intent, ApprovalApplyIntent):
            raise TypeError("PERSISTED_APPROVAL_INTENT_REQUIRED")
        if not isinstance(profile, SandboxProfile):
            raise ValueError("SANDBOX_PROFILE_NOT_ALLOWLISTED")
        if isinstance(now, bool) or not isinstance(now, int):
            raise ValueError("SANDBOX_CLOCK_INVALID")
        if intent.expires_at <= now:
            raise ValueError("APPROVAL_INTENT_EXPIRED")
        if not isinstance(apply_intent_id, str) or not apply_intent_id.strip():
            raise ValueError("APPLY_INTENT_ID_REQUIRED")
        if not isinstance(workspace_id, str) or not workspace_id.strip():
            raise ValueError("SANDBOX_WORKSPACE_ID_REQUIRED")
        return cls(
            execution_id=str(uuid4()),
            apply_intent_id=apply_intent_id,
            proposal_id=intent.proposal_id,
            proposal_sha256=intent.proposal_sha256,
            repository_id=intent.repository_id,
            target_branch=intent.target_branch,
            base_commit_sha=intent.base_commit_sha,
            workspace_id=workspace_id,
            profile=profile,
            allowed_file_paths=intent.file_paths,
            limits=limits or SandboxLimits(),
        )

    @property
    def argv(self) -> tuple[str, ...]:
        """Return the fixed argv for this profile; never invoke through a shell."""
        return PROFILE_ARGV[self.profile]


@dataclass(frozen=True)
class SandboxExecutionResult:
    execution_id: str
    status: str
    exit_code: int | None
    duration_ms: int
    output_digest: str | None = None
    artifact_digest: str | None = None
    error_code: str | None = None


class SandboxExecutor(Protocol):
    """Port for an external isolated runner; no production adapter is included."""

    def execute(self, request: SandboxExecutionRequest) -> SandboxExecutionResult:
        """Run only the request's fixed profile in a disposable isolated workspace.

        Implementations must enforce no network, no credentials, resource limits,
        read-only host/root filesystem, workspace-only writes, process cleanup,
        and bounded/redacted output. They must not apply changes to the target repo.
        """
        ...
