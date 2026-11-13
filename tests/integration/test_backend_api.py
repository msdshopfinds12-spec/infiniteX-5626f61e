from fastapi.testclient import TestClient

from backend.app.config import Settings, get_settings
from backend.app.dependencies import get_iq_engine
from backend.app.main import app
from iq_core.kernel.iq_engine import IQEngine


def setup_function() -> None:
    get_settings.cache_clear()
    get_iq_engine.cache_clear()


def teardown_function() -> None:
    app.dependency_overrides.clear()
    get_settings.cache_clear()
    get_iq_engine.cache_clear()


def test_health_endpoint_is_public() -> None:
    with TestClient(app) as client:
        response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_protected_tasks_fail_closed_without_configured_token() -> None:
    app.dependency_overrides[get_settings] = lambda: Settings(api_auth_token=None)
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/tasks",
            json={"name": "research", "objective": "Test"},
        )
    assert response.status_code == 503


def test_task_api_requires_valid_bearer_token() -> None:
    app.dependency_overrides[get_settings] = lambda: Settings(api_auth_token="correct-secret")
    with TestClient(app) as client:
        missing = client.get("/api/v1/tasks/not-found")
        invalid = client.get(
            "/api/v1/tasks/not-found",
            headers={"Authorization": "Bearer wrong-secret"},
        )
    assert missing.status_code == 401
    assert invalid.status_code == 401


def test_task_create_read_and_execute_api() -> None:
    engine = IQEngine()
    app.dependency_overrides[get_settings] = lambda: Settings(api_auth_token="test-secret")
    app.dependency_overrides[get_iq_engine] = lambda: engine
    headers = {"Authorization": "Bearer test-secret"}

    with TestClient(app) as client:
        created = client.post(
            "/api/v1/tasks",
            headers=headers,
            json={
                "name": "research",
                "objective": "Research API foundation",
                "input_data": {"topic": "infiniteGX.7"},
            },
        )
        assert created.status_code == 201
        task_id = created.json()["task_id"]

        fetched = client.get(f"/api/v1/tasks/{task_id}", headers=headers)
        assert fetched.status_code == 200
        assert fetched.json()["status"] == "PENDING"

        executed = client.post(
            f"/api/v1/tasks/{task_id}/execute",
            headers=headers,
        )
        assert executed.status_code == 200
        assert executed.json()["status"] == "BLOCKED"
        assert executed.json()["error_type"] == "HandlerNotFound"


def test_invalid_task_payload_is_rejected() -> None:
    app.dependency_overrides[get_settings] = lambda: Settings(api_auth_token="test-secret")
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/tasks",
            headers={"Authorization": "Bearer test-secret"},
            json={"name": " ", "objective": " "},
        )
    assert response.status_code == 422
