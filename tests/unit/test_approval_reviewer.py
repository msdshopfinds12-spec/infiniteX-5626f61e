from backend.app.auth.dependencies import CurrentPrincipal
from backend.app.auth.approval_reviewer import get_approval_reviewer


def test_approval_reviewer_is_derived_from_authenticated_owner():
    principal = CurrentPrincipal(
        subject="verified-owner-subject",
        tenant_id="11111111-1111-4111-8111-111111111111",
    )

    reviewer = get_approval_reviewer(principal)

    assert reviewer.subject == "verified-owner-subject"
    assert reviewer.role == "owner"
    assert reviewer.tenant_id == "11111111-1111-4111-8111-111111111111"


def test_approval_reviewer_does_not_accept_arbitrary_principal_shape():
    class ForgedPrincipal:
        subject = "attacker"
        tenant_id = "11111111-1111-4111-8111-111111111111"

    try:
        get_approval_reviewer(ForgedPrincipal())
    except TypeError as error:
        assert "authenticated principal" in str(error)
    else:
        raise AssertionError("forged principal must be rejected")
