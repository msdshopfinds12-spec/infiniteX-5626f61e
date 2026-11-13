from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from backend.app.config import Settings, get_settings
from backend.app.main import app
from database.models import Base
from database.session import get_db_session

TENANT = "11111111-1111-4111-8111-111111111111"
HEADERS = {"Authorization": "Bearer memory-test", "X-Tenant-ID": TENANT}


def setup_function():
    get_settings.cache_clear()
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
    app.dependency_overrides[get_settings] = lambda: Settings(api_auth_token="memory-test")


def teardown_function():
    app.dependency_overrides.clear()
    get_settings.cache_clear()


def test_memory_api_create_and_search():
    with TestClient(app) as client:
        created = client.post("/api/v1/memory", headers=HEADERS,
                              json={"content": "Company Brain stores project knowledge"})
        assert created.status_code == 201
        response = client.get("/api/v1/memory/search?q=project%20knowledge",
                              headers=HEADERS)
    assert response.status_code == 200
    assert response.json()[0]["memory_id"] == created.json()["memory_id"]


def test_memory_api_requires_authentication():
    with TestClient(app) as client:
        response = client.get("/api/v1/memory/search?q=test",
                              headers={"X-Tenant-ID": TENANT})
    assert response.status_code == 401


def test_memory_api_rejects_invalid_tenant_and_sensitive_metadata():
    with TestClient(app) as client:
        invalid = client.post("/api/v1/memory",
            headers={"Authorization": "Bearer memory-test", "X-Tenant-ID": "bad"},
            json={"content": "some memory"})
        sensitive = client.post("/api/v1/memory", headers=HEADERS,
            json={"content": "safe", "metadata": {"password": "never-store"}})
    assert invalid.status_code == 400
    assert sensitive.status_code == 422
