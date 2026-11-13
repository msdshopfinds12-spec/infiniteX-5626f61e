"""Fail-closed capability gateway with authorization and approval hooks."""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any, Callable
from uuid import uuid4
from iq_core.capabilities.tool_registry import CapabilityRisk, ToolDefinition, ToolRegistry


@dataclass(frozen=True)
class CapabilityContext:
    """Trusted server-created context; never construct from untrusted client claims."""
    principal_id: str
    tenant_id: str
    correlation_id: str = field(default_factory=lambda: str(uuid4()))


@dataclass(frozen=True)
class ApprovalDecision:
    approved: bool
    approval_id: str | None = None
    reason: str | None = None


@dataclass(frozen=True)
class ToolInvocationResult:
    tool_name: str
    status: str
    output: Any = None
    error_code: str | None = None
    correlation_id: str | None = None
    approval_id: str | None = None


AuthorizeHook = Callable[[CapabilityContext, ToolDefinition], bool]
ApprovalHook = Callable[[CapabilityContext, ToolDefinition, dict[str, Any]], ApprovalDecision]


class ToolGateway:
    """Invocation gateway; missing authorization denies all calls.

    WRITE and DESTRUCTIVE tools additionally require an approval hook that returns an
    explicit approved decision. No provider or network adapter is called implicitly.
    """

    def __init__(self, registry: ToolRegistry, *,
                 authorize: AuthorizeHook | None = None,
                 approval: ApprovalHook | None = None) -> None:
        self.registry = registry
        self.authorize = authorize
        self.approval = approval

    def invoke(self, tool_name: str, payload: dict[str, Any], *,
               context: CapabilityContext | None) -> ToolInvocationResult:
        if (context is None or not isinstance(context.principal_id, str)
                or not context.principal_id.strip() or not isinstance(context.tenant_id, str)
                or not context.tenant_id.strip()):
            return ToolInvocationResult(tool_name, "DENIED", error_code="TRUSTED_CONTEXT_REQUIRED")
        definition = self.registry.get(tool_name)
        if definition is None:
            return ToolInvocationResult(tool_name, "NOT_FOUND", error_code="TOOL_NOT_REGISTERED",
                                        correlation_id=context.correlation_id)
        if self.authorize is None:
            return ToolInvocationResult(tool_name, "DENIED",
                                        error_code="AUTHORIZATION_NOT_CONFIGURED",
                                        correlation_id=context.correlation_id)
        try:
            authorized = self.authorize(context, definition)
        except Exception:
            return ToolInvocationResult(tool_name, "DENIED",
                                        error_code="AUTHORIZATION_CHECK_FAILED",
                                        correlation_id=context.correlation_id)
        if authorized is not True:
            return ToolInvocationResult(tool_name, "DENIED",
                                        error_code="CAPABILITY_NOT_AUTHORIZED",
                                        correlation_id=context.correlation_id)

        if not isinstance(payload, dict):
            return ToolInvocationResult(tool_name, "INVALID_INPUT",
                                        error_code="PAYLOAD_MUST_BE_OBJECT",
                                        correlation_id=context.correlation_id)
        validated_payload = dict(payload)
        if definition.input_validator is not None:
            try:
                validated_payload = definition.input_validator(dict(payload))
            except Exception:
                return ToolInvocationResult(tool_name, "INVALID_INPUT",
                                            error_code="INPUT_VALIDATION_FAILED",
                                            correlation_id=context.correlation_id)
            if not isinstance(validated_payload, dict):
                return ToolInvocationResult(tool_name, "INVALID_INPUT",
                                            error_code="VALIDATOR_MUST_RETURN_OBJECT",
                                            correlation_id=context.correlation_id)

        approval_id = None
        if definition.risk in (CapabilityRisk.WRITE, CapabilityRisk.DESTRUCTIVE):
            if self.approval is None:
                return ToolInvocationResult(tool_name, "NEEDS_APPROVAL",
                                            error_code="APPROVAL_GATE_NOT_CONFIGURED",
                                            correlation_id=context.correlation_id)
            try:
                decision = self.approval(context, definition, validated_payload)
            except Exception:
                return ToolInvocationResult(tool_name, "NEEDS_APPROVAL",
                                            error_code="APPROVAL_CHECK_FAILED",
                                            correlation_id=context.correlation_id)
            if not isinstance(decision, ApprovalDecision) or decision.approved is not True:
                return ToolInvocationResult(tool_name, "NEEDS_APPROVAL",
                                            error_code="APPROVAL_NOT_GRANTED",
                                            correlation_id=context.correlation_id)
            approval_id = decision.approval_id

        try:
            output = definition.handler(validated_payload)
        except Exception as exc:
            return ToolInvocationResult(tool_name, "FAILED",
                                        error_code=exc.__class__.__name__,
                                        correlation_id=context.correlation_id,
                                        approval_id=approval_id)
        return ToolInvocationResult(tool_name, "COMPLETED", output=output,
                                    correlation_id=context.correlation_id,
                                    approval_id=approval_id)
