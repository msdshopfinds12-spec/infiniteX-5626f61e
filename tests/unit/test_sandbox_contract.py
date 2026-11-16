from dataclasses import FrozenInstanceError

import pytest

from iq_core.agents.approval_apply_intent import ApprovalApplyIntent
from iq_core.execution.sandbox_contract import (
    PROFILE_ARGV,
    SandboxExecutionRequest,
    SandboxLimits,
    SandboxProfile,
)


def intent(**overrides):
    values = {
        "nonce_id": "nonce-1",
        "reviewer_subject": "reviewer-1",
        "reviewer_role": "owner",
        "repository_id": "repo-1",
        "target_branch": "fix/infiniteX-foundation-hardening",
        "base_commit_sha": "a" * 40,
        "proposal_id": "proposal-1",
        "proposal_sha256": "b" * 64,
        "policy_version": "policy-v1",
        "file_paths": ("iq_core/example.py",),
        "issued_at": 100,
        "expires_at": 200,
        "schema_version": 1,
    }
    values.update(overrides)
    return ApprovalApplyIntent(**values)


def request(**overrides):
    values = {
        "intent": intent(),
        "apply_intent_id": "apply-intent-1",
        "workspace_id": "workspace-1",
        "profile": SandboxProfile.PYTHON_UNIT_TESTS,
        "now": 150,
    }
    values.update(overrides)
    return SandboxExecutionRequest.from_persisted_intent(**values)


def test_profile_uses_fixed_argv_without_shell():
    result = request()
    assert result.argv == ("python", "-m", "pytest", "-q")
    assert result.argv == PROFILE_ARGV[result.profile]
    assert "shell" not in result.argv


def test_request_is_bound_to_approval_scope():
    result = request()
    assert result.proposal_id == "proposal-1"
    assert result.proposal_sha256 == "b" * 64
    assert result.repository_id == "repo-1"
    assert result.target_branch == "fix/infiniteX-foundation-hardening"
    assert result.base_commit_sha == "a" * 40
    assert result.allowed_file_paths == ("iq_core/example.py",)


def test_expired_intent_is_rejected():
    with pytest.raises(ValueError, match="APPROVAL_INTENT_EXPIRED"):
        request(now=200)


def test_arbitrary_profile_is_rejected():
    with pytest.raises(ValueError, match="SANDBOX_PROFILE_NOT_ALLOWLISTED"):
        request(profile="python -c 'import os; ...'")


def test_limits_fail_closed_for_network_or_credentials():
    with pytest.raises(ValueError, match="SANDBOX_NETWORK_MUST_BE_DISABLED"):
        SandboxLimits(network_access=True)
    with pytest.raises(ValueError, match="SANDBOX_CREDENTIALS_MUST_BE_UNAVAILABLE"):
        SandboxLimits(credential_access=True)


def test_limits_reject_unbounded_resources_and_bool_values():
    with pytest.raises(ValueError, match="SANDBOX_TIMEOUT_OUT_OF_RANGE"):
        SandboxLimits(timeout_seconds=3600)
    with pytest.raises(ValueError, match="SANDBOX_MEMORY_OUT_OF_RANGE"):
        SandboxLimits(memory_mb=8192)
    with pytest.raises(ValueError, match="SANDBOX_CPU_OUT_OF_RANGE"):
        SandboxLimits(cpu_count=True)


def test_request_is_immutable():
    result = request()
    with pytest.raises(FrozenInstanceError):
        result.target_branch = "main"


def test_untrusted_intent_type_is_rejected():
    with pytest.raises(TypeError, match="PERSISTED_APPROVAL_INTENT_REQUIRED"):
        request(intent={"proposal_id": "attacker-controlled"})
