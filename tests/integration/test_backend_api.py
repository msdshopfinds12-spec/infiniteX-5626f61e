from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from backend.app.config import Settings, get_settings
from backend.app.dependencies import get_iq_engine
from backend.app.main import app
from database.models import Base
from database.session import get_db_session
from iq_core.kernel.iq_engine import IQEngine

TENANT = "11111111-1111-4111-8111-111111111111"
HEADERS = {"Authorization": "Bearer test-secret", "X-Tenant-ID": TENANT}


def setup_function():
    get_settings.cache_clear()
    get_iq_engine.cache_clear()
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False},
                           poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    def override_session():
        session = factory()
        try:
            yield session
        finally:
            session.close()
    app.dependency_overrides[get_db_session] = override_session


def teardown_function():
    app.dependency_overrides.clear()
    get_settings.cache_clear()
    get_iq_engine.cache_clear()


def test_health_is_public():
    with TestClient(app) as client:
        response = client.get("/health")
    assert response.status_code == 200 and response.json()["status"] == "ok"


def test_protected_routes_fail_closed_without_token():
    app.dependency_overrides[get_settings] = lambda: Settings(api_auth_token=None)
    with TestClient(app) as client:
        response = client.post("/api/v1/tasks", headers={"X-Tenant-ID": TENANT},
                               json={"name": "research", "objective": "test"})
    assert response.status_code == 503


def test_task_routes_require_bearer_token():
    app.dependency_overrides[get_settings] = lambda: Settings(api_auth_token="correct-secret")
    with TestClient(app) as client:
        response = client.get("/api/v1/tasks/missing", headers={"X-Tenant-ID": TENANT})
    assert response.status_code == 401


def test_task_create_read_execute_persists_status_and_result():
    engine = IQEngine()
    engine.register_handler("research", lambda data: {"answer": data["topic"]})
    app.dependency_overrides[get_settings] = lambda: Settings(api_auth_token="test-secret")
    app.dependency_overrides[get_iq_engine] = lambda: engine
    with TestClient(app) as client:
        created = client.post("/api/v1/tasks", headers=HEADERS,
                              json={"name": "research", "objective": "API persistence",
                                    "input_data": {"topic": "infiniteGX.7"}})
        assert created.status_code == 201
        task_id = created.json()["task_id"]
        assert created.json()["tenant_id"] == TENANT
        assert client.get(f"/api/v1/tasks/{task_id}", headers=HEADERS).json()["status"] == "PENDING"
        executed = client.post(f"/api/v1/tasks/{task_id}/execute", headers=HEADERS)
        assert executed.status_code == 200
        assert executed.json()["status"] == "COMPLETED"
        loaded = client.get(f"/api/v1/tasks/{task_id}", headers=HEADERS).json()
        assert loaded["status"] == "COMPLETED"
        assert loaded["result"] == {"answer": "infiniteGX.7"}


def test_tenant_cannot_read_another_tenant_task():
    app.dependency_overrides[get_settings] = lambda: Settings(api_auth_token="test-secret")
    other = {"Authorization": "Bearer test-secret",
             "X-Tenant-ID": "22222222-2222-4222-8222-222222222222"}
    with TestClient(app) as client:
        created = client.post("/api/v1/tasks", headers=HEADERS,
                              json={"name": "research", "objective": "private"})
        task_id = created.json()["task_id"]
        response = client.get(f"/api/v1/tasks/{task_id}", headers=other)
    assert response.status_code == 404


def test_invalid_tenant_id_is_rejected():
    app.dependency_overrides[get_settings] = lambda: Settings(api_auth_token="test-secret")
    with TestClient(app) as client:
        response = client.post("/api/v1/tasks",
            headers={"Authorization": "Bearer test-secret", "X-Tenant-ID": "invalid"},
            json={"name": "research", "objective": "tenant validation"})
    assert response.status_code == 400


def test_invalid_task_payload_is_rejected():
    app.dependency_overrides[get_settings] = lambda: Settings(api_auth_token="test-secret")
    with TestClient(app) as client:
        response = client.post("/api/v1/tasks", headers=HEADERS,
                               json={"name": " ", "objective": " "})
    assert response.status_code == 422
