from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.app.auth.dependencies import CurrentPrincipal, get_current_principal
from backend.app.dependencies import get_iq_engine
from backend.app.main import app
from database.models import Base
from database.session import get_db_session
from iq_core.kernel.iq_engine import IQEngine

TENANT = "11111111-1111-4111-8111-111111111111"
OWNER = CurrentPrincipal(subject="configured-test-owner", tenant_id=TENANT)


def setup_function():
    app.dependency_overrides.clear()
    get_iq_engine.cache_clear()
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)

    def override_session():
        session = factory()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db_session] = override_session
    app.dependency_overrides[get_current_principal] = lambda: OWNER


def teardown_function():
    app.dependency_overrides.clear()
    get_iq_engine.cache_clear()


def test_health_is_public():
    with TestClient(app) as client:
        response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_task_create_read_execute_persists_status_and_result():
    engine = IQEngine()
    engine.register_handler("research", lambda data: {"answer": data["topic"]})
    app.dependency_overrides[get_iq_engine] = lambda: engine
    with TestClient(app) as client:
        created = client.post(
            "/api/v1/tasks",
            json={
                "name": "research",
                "objective": "API persistence",
                "input_data": {"topic": "infiniteGX.7"},
            },
        )
        assert created.status_code == 201
        task_id = created.json()["task_id"]
        assert created.json()["tenant_id"] == TENANT
        assert client.get(f"/api/v1/tasks/{task_id}").json()["status"] == "PENDING"
        executed = client.post(f"/api/v1/tasks/{task_id}/execute")
        assert executed.status_code == 200
        assert executed.json()["status"] == "COMPLETED"
        loaded = client.get(f"/api/v1/tasks/{task_id}").json()
        assert loaded["status"] == "COMPLETED"
        assert loaded["result"] == {"answer": "infiniteGX.7"}


def test_client_tenant_header_cannot_change_authenticated_tenant():
    forged_tenant = "22222222-2222-4222-8222-222222222222"
    with TestClient(app) as client:
        created = client.post(
            "/api/v1/tasks",
            headers={"X-Tenant-ID": forged_tenant},
            json={"name": "research", "objective": "owner-scoped"},
        )
        assert created.status_code == 201
        assert created.json()["tenant_id"] == TENANT
        loaded = client.get(
            f"/api/v1/tasks/{created.json()['task_id']}",
            headers={"X-Tenant-ID": forged_tenant},
        )
    assert loaded.status_code == 200
    assert loaded.json()["tenant_id"] == TENANT


def test_invalid_task_payload_is_rejected():
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/tasks",
            json={"name": " ", "objective": " "},
        )
    assert response.status_code == 422


def test_idempotent_task_create_returns_existing_record():
    headers = {"Idempotency-Key": "integration-create-001"}
    payload = {
        "name": "research",
        "objective": "same request",
        "input_data": {"topic": "tenant safety"},
    }
    with TestClient(app) as client:
        first = client.post("/api/v1/tasks", headers=headers, json=payload)
        second = client.post("/api/v1/tasks", headers=headers, json=payload)
    assert first.status_code == 201
    assert second.status_code == 200
    assert first.json()["task_id"] == second.json()["task_id"]


def test_idempotency_key_reuse_with_different_body_conflicts():
    headers = {"Idempotency-Key": "integration-create-002"}
    with TestClient(app) as client:
        first = client.post(
            "/api/v1/tasks",
            headers=headers,
            json={"name": "research", "objective": "first"},
        )
        second = client.post(
            "/api/v1/tasks",
            headers=headers,
            json={"name": "research", "objective": "different"},
        )
    assert first.status_code == 201
    assert second.status_code == 409


def test_empty_idempotency_key_is_rejected():
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/tasks",
            headers={"Idempotency-Key": ""},
            json={"name": "research", "objective": "empty key"},
        )
    assert response.status_code == 400
