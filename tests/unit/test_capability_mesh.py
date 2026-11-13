from __future__ import annotations
import pytest
from iq_core.capabilities.tool_gateway import ApprovalDecision, CapabilityContext, CapabilityRisk, ToolGateway
from iq_core.capabilities.tool_registry import ToolDefinition, ToolRegistry


def context() -> CapabilityContext:
    return CapabilityContext(principal_id="owner-internal", tenant_id="tenant-internal",
                             correlation_id="corr-capability")


def test_registry_registers_and_rejects_duplicates() -> None:
    registry = ToolRegistry()
    tool = ToolDefinition("lookup", "Read-only lookup", CapabilityRisk.READ_ONLY, lambda payload: payload)
    registry.register(tool)
    assert registry.get("lookup") == tool
    with pytest.raises(ValueError, match="already registered"):
        registry.register(tool)


def test_registry_rejects_unknown_risk_level() -> None:
    registry = ToolRegistry()
    tool = ToolDefinition("unknown", "Unknown risk", "UNCLASSIFIED", lambda data: data)
    with pytest.raises(ValueError, match="supported CapabilityRisk"):
        registry.register(tool)


def test_gateway_denies_without_trusted_context() -> None:
    called = []
    registry = ToolRegistry()
    registry.register(ToolDefinition("lookup", "Lookup", CapabilityRisk.READ_ONLY, lambda data: called.append(data)))
    result = ToolGateway(registry, authorize=lambda *_: True).invoke("lookup", {}, context=None)
    assert result.status == "DENIED"
    assert result.error_code == "TRUSTED_CONTEXT_REQUIRED"
    assert called == []


def test_gateway_fails_closed_without_authorization_hook() -> None:
    called = []
    registry = ToolRegistry()
    registry.register(ToolDefinition("lookup", "Lookup", CapabilityRisk.READ_ONLY, lambda data: called.append(data)))
    result = ToolGateway(registry).invoke("lookup", {}, context=context())
    assert result.status == "DENIED"
    assert result.error_code == "AUTHORIZATION_NOT_CONFIGURED"
    assert called == []


def test_gateway_requires_boolean_true_from_authorization_hook() -> None:
    called = []
    registry = ToolRegistry()
    registry.register(ToolDefinition("lookup", "Lookup", CapabilityRisk.READ_ONLY, lambda data: called.append(data)))
    result = ToolGateway(registry, authorize=lambda *_: "yes").invoke("lookup", {}, context=context())
    assert result.error_code == "CAPABILITY_NOT_AUTHORIZED"
    assert called == []


def test_gateway_denies_unauthorized_tool_before_handler() -> None:
    called = []
    registry = ToolRegistry()
    registry.register(ToolDefinition("lookup", "Lookup", CapabilityRisk.READ_ONLY, lambda data: called.append(data)))
    result = ToolGateway(registry, authorize=lambda *_: False).invoke("lookup", {}, context=context())
    assert result.error_code == "CAPABILITY_NOT_AUTHORIZED"
    assert called == []


def test_gateway_validates_payload_before_handler() -> None:
    called = []
    registry = ToolRegistry()
    def validate(payload: dict) -> dict:
        if "query" not in payload:
            raise ValueError("query required")
        return {"query": str(payload["query"])}
    registry.register(ToolDefinition("lookup", "Lookup", CapabilityRisk.READ_ONLY, lambda data: called.append(data), validate))
    result = ToolGateway(registry, authorize=lambda *_: True).invoke("lookup", {}, context=context())
    assert result.status == "INVALID_INPUT"
    assert called == []


def test_gateway_executes_authorized_read_only_tool() -> None:
    registry = ToolRegistry()
    registry.register(ToolDefinition("lookup", "Lookup", CapabilityRisk.READ_ONLY, lambda data: {"found": data["query"]}))
    result = ToolGateway(registry, authorize=lambda *_: True).invoke("lookup", {"query": "docs"}, context=context())
    assert result.status == "COMPLETED"
    assert result.output == {"found": "docs"}
    assert result.correlation_id == "corr-capability"


def test_write_tool_requires_explicit_approval_hook() -> None:
    called = []
    registry = ToolRegistry()
    registry.register(ToolDefinition("write", "Write", CapabilityRisk.WRITE, lambda data: called.append(data)))
    result = ToolGateway(registry, authorize=lambda *_: True).invoke("write", {}, context=context())
    assert result.status == "NEEDS_APPROVAL"
    assert result.error_code == "APPROVAL_GATE_NOT_CONFIGURED"
    assert called == []


def test_write_tool_executes_only_after_approval() -> None:
    registry = ToolRegistry()
    registry.register(ToolDefinition("write", "Write", CapabilityRisk.WRITE, lambda data: {"written": True}))
    gateway = ToolGateway(registry, authorize=lambda *_: True,
                          approval=lambda *_: ApprovalDecision(True, approval_id="approval-123"))
    result = gateway.invoke("write", {}, context=context())
    assert result.status == "COMPLETED"
    assert result.approval_id == "approval-123"


def test_approval_requires_explicit_boolean_true() -> None:
    called = []
    registry = ToolRegistry()
    registry.register(ToolDefinition("write", "Write", CapabilityRisk.WRITE, lambda data: called.append(data)))
    gateway = ToolGateway(registry, authorize=lambda *_: True,
                          approval=lambda *_: ApprovalDecision("yes"))
    result = gateway.invoke("write", {}, context=context())
    assert result.status == "NEEDS_APPROVAL"
    assert called == []


def test_destructive_tool_denied_when_approval_is_rejected() -> None:
    called = []
    registry = ToolRegistry()
    registry.register(ToolDefinition("delete", "Delete", CapabilityRisk.DESTRUCTIVE, lambda data: called.append(data)))
    gateway = ToolGateway(registry, authorize=lambda *_: True,
                          approval=lambda *_: ApprovalDecision(False, reason="not approved"))
    result = gateway.invoke("delete", {}, context=context())
    assert result.status == "NEEDS_APPROVAL"
    assert called == []


def test_gateway_handles_handler_errors_without_leaking_message() -> None:
    registry = ToolRegistry()
    def broken(_: dict) -> None:
        raise RuntimeError("sensitive provider response")
    registry.register(ToolDefinition("broken", "Broken", CapabilityRisk.READ_ONLY, broken))
    result = ToolGateway(registry, authorize=lambda *_: True).invoke("broken", {}, context=context())
    assert result.status == "FAILED"
    assert result.error_code == "RuntimeError"
    assert "sensitive" not in str(result)


def test_gateway_returns_not_found_for_unregistered_tool() -> None:
    result = ToolGateway(ToolRegistry(), authorize=lambda *_: True).invoke("missing", {}, context=context())
    assert result.status == "NOT_FOUND"
