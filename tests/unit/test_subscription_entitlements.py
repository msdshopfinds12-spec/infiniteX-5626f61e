import pytest

from iq_core.subscriptions.entitlements import (
    BASELINE_CAPABILITIES,
    Capability,
    FeatureNotAvailable,
    Plan,
    require_capability,
    resolve_entitlements,
)


@pytest.mark.parametrize("plan", list(Plan))
def test_every_plan_keeps_security_privacy_and_approval_baseline(plan):
    snapshot = resolve_entitlements(plan)
    assert BASELINE_CAPABILITIES <= snapshot.capabilities


def test_missing_or_unknown_plan_fails_closed_to_standard():
    assert resolve_entitlements(None).plan is Plan.STANDARD
    assert resolve_entitlements("unrecognized-premium").plan is Plan.STANDARD


def test_standard_does_not_receive_premium_model_routing():
    snapshot = resolve_entitlements(Plan.STANDARD)
    assert not snapshot.allows(Capability.MODEL_ROUTING)


def test_pro_receives_advanced_model_routing():
    snapshot = resolve_entitlements(Plan.PRO)
    assert snapshot.allows(Capability.MODEL_ROUTING)


def test_capability_guard_rejects_unavailable_feature():
    snapshot = resolve_entitlements(Plan.STANDARD)
    with pytest.raises(FeatureNotAvailable):
        require_capability(snapshot, Capability.MODEL_ROUTING)


def test_enterprise_includes_admin_capabilities_without_removing_safety():
    snapshot = resolve_entitlements(Plan.ENTERPRISE)
    assert snapshot.allows(Capability.POLICY_ADMIN)
    assert snapshot.allows(Capability.SECURITY_BASELINE)
    assert snapshot.allows(Capability.APPROVAL_REQUIRED)
