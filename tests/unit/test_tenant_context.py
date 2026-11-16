from unittest.mock import Mock

import pytest

from database.tenant_context import set_tenant_context


def make_session(dialect_name: str):
    session = Mock()
    session.get_bind.return_value.dialect.name = dialect_name
    return session


def test_sqlite_tenant_context_is_noop_for_unit_tests():
    session = make_session("sqlite")
    set_tenant_context(session, "tenant-a")
    session.execute.assert_not_called()


def test_postgres_tenant_context_uses_bound_parameter_and_transaction_local_setting():
    session = make_session("postgresql")
    tenant_id = "11111111-1111-4111-8111-111111111111"

    set_tenant_context(session, tenant_id)

    statement, parameters = session.execute.call_args.args
    assert "set_config('app.tenant_id', :tenant_id, true)" in str(statement)
    assert parameters == {"tenant_id": tenant_id}


def test_postgres_tenant_context_rejects_invalid_uuid():
    session = make_session("postgresql")

    with pytest.raises(ValueError, match="valid UUID"):
        set_tenant_context(session, "not-a-uuid")

    session.execute.assert_not_called()


def test_tenant_context_rejects_empty_identity():
    session = make_session("postgresql")

    with pytest.raises(ValueError, match="required"):
        set_tenant_context(session, " ")

    session.execute.assert_not_called()
