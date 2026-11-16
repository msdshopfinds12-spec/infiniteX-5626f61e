"""Real PostgreSQL tests for audit locking, rollback, and tenant RLS.

These tests use a disposable CI database. They create their own schema from
SQLAlchemy metadata and test-only RLS policies; they do not execute Alembic
migrations or touch any configured application database.
"""
from __future__ import annotations

import os
from concurrent.futures import ThreadPoolExecutor

import pytest
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import Session

from database.audit_persistence import append_audit_event
from database.models import AuditEvent, Base
from database.tenant_context import set_tenant_context

DATABASE_URL = os.getenv("PG_TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(
    not DATABASE_URL,
    reason="PG_TEST_DATABASE_URL is only configured by the isolated PostgreSQL CI service",
)

APP_ROLE = "infinitegx_test_app"


@pytest.fixture()
def pg_engine():
    engine = create_engine(DATABASE_URL, pool_size=10, max_overflow=0)
    Base.metadata.create_all(engine)

    # CI connects as the disposable postgres superuser. The application test
    # role is deliberately non-owner, non-superuser, and cannot bypass RLS.
    with engine.begin() as connection:
        connection.execute(
            text(
                f"""
                DO $$
                BEGIN
                    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{APP_ROLE}') THEN
                        CREATE ROLE {APP_ROLE} NOLOGIN NOSUPERUSER NOBYPASSRLS;
                    END IF;
                END
                $$;
                """
            )
        )
        connection.execute(text(f"GRANT USAGE ON SCHEMA public TO {APP_ROLE}"))
        connection.execute(
            text(
                f"GRANT SELECT, INSERT ON audit_events TO {APP_ROLE}"
            )
        )
        connection.execute(
            text(
                f"GRANT SELECT, INSERT, UPDATE ON audit_stream_heads TO {APP_ROLE}"
            )
        )
        for table, policy in (
            ("audit_events", "test_audit_events_tenant_policy"),
            ("audit_stream_heads", "test_audit_heads_tenant_policy"),
        ):
            connection.execute(text(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY"))
            connection.execute(text(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY"))
            connection.execute(text(f"DROP POLICY IF EXISTS {policy} ON {table}"))
            connection.execute(
                text(
                    f"""
                    CREATE POLICY {policy} ON {table}
                    USING (tenant_id = current_setting('app.tenant_id', true))
                    WITH CHECK (tenant_id = current_setting('app.tenant_id', true))
                    """
                )
            )
    try:
        yield engine
    finally:
        with engine.begin() as connection:
            for table, policy in (
                ("audit_events", "test_audit_events_tenant_policy"),
                ("audit_stream_heads", "test_audit_heads_tenant_policy"),
            ):
                connection.execute(text(f"DROP POLICY IF EXISTS {policy} ON {table}"))
                connection.execute(text(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY"))
        Base.metadata.drop_all(engine)
        engine.dispose()


def _append(engine, tenant_id: str, stream_id: str, action: str) -> int:
    with Session(engine) as session:
        with session.begin():
            event = append_audit_event(
                session,
                tenant_id=tenant_id,
                stream_id=stream_id,
                actor="postgres-integration-test",
                action=action,
                resource_type="integration_test",
                resource_id=stream_id,
                outcome="success",
            )
            return event.sequence


def test_postgres_concurrent_appends_serialize_existing_stream(pg_engine):
    _append(pg_engine, "11111111-1111-4111-8111-111111111111", "concurrent", "seed")

    with ThreadPoolExecutor(max_workers=8) as executor:
        sequences = list(
            executor.map(
                lambda index: _append(
                    pg_engine,
                    "11111111-1111-4111-8111-111111111111",
                    "concurrent",
                    f"parallel-{index}",
                ),
                range(8),
            )
        )

    assert sorted(sequences) == list(range(2, 10))
    with Session(pg_engine) as session:
        events = session.scalars(
            select(AuditEvent)
            .where(
                AuditEvent.tenant_id == "11111111-1111-4111-8111-111111111111",
                AuditEvent.stream_id == "concurrent",
            )
            .order_by(AuditEvent.sequence)
        ).all()
        assert [event.sequence for event in events] == list(range(1, 10))
        assert all(
            events[index].previous_digest == events[index - 1].digest
            for index in range(1, len(events))
        )


def test_postgres_transaction_rollback_removes_event_and_stream_head(pg_engine):
    with pytest.raises(RuntimeError, match="force rollback"):
        with Session(pg_engine) as session:
            with session.begin():
                append_audit_event(
                    session,
                    tenant_id="33333333-3333-4333-8333-333333333333",
                    stream_id="rollback",
                    actor="tester",
                    action="will_rollback",
                    resource_type="test",
                    resource_id="rollback",
                    outcome="success",
                )
                raise RuntimeError("force rollback")

    with Session(pg_engine) as session:
        assert session.scalar(
            select(AuditEvent).where(AuditEvent.tenant_id == "33333333-3333-4333-8333-333333333333")
        ) is None


def test_postgres_rls_hides_other_tenants_from_restricted_role(pg_engine):
    _append(pg_engine, "11111111-1111-4111-8111-111111111111", "tenant-a-stream", "visible")
    _append(pg_engine, "22222222-2222-4222-8222-222222222222", "tenant-b-stream", "hidden")

    with Session(pg_engine) as session:
        with session.begin():
            session.execute(text(f"SET LOCAL ROLE {APP_ROLE}"))
            set_tenant_context(session, "11111111-1111-4111-8111-111111111111")
            rows = session.scalars(select(AuditEvent)).all()
            assert rows
            assert {row.tenant_id for row in rows} == {"11111111-1111-4111-8111-111111111111"}
            assert session.scalar(
                select(AuditEvent).where(
                    AuditEvent.tenant_id == "22222222-2222-4222-8222-222222222222"
                )
            ) is None


def test_postgres_rls_without_tenant_context_returns_no_rows(pg_engine):
    _append(pg_engine, "11111111-1111-4111-8111-111111111111", "no-context", "seed")

    with Session(pg_engine) as session:
        with session.begin():
            session.execute(text(f"SET LOCAL ROLE {APP_ROLE}"))
            assert session.scalars(select(AuditEvent)).all() == []
