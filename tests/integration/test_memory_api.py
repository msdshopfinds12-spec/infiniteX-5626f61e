from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.app.auth.dependencies import CurrentPrincipal, get_current_principal
from backend.app.main import app
from database.models import Base
from database.session import get_db_session

TENANT = "11111111-1111-4111-8111-111111111111"
OWNER = CurrentPrincipal(subject="configured-test-owner", tenant_id=TENANT)


def setup_function():
    app.dependency_overrides.clear()
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


def test_memory_api_create_and_search():
    with TestClient(app) as client:
        created = client.post(
            "/api/v1/memory",
            json={"content": "Company Brain stores project knowledge"},
        )
        assert created.status_code == 201
        response = client.get("/api/v1/memory/search?q=project%20knowledge")
    assert response.status_code == 200
    assert response.json()[0]["memory_id"] == created.json()["memory_id"]


def test_memory_tenant_header_is_ignored():
    forged_tenant = "22222222-2222-4222-8222-222222222222"
    with TestClient(app) as client:
        created = client.post(
            "/api/v1/memory",
            headers={"X-Tenant-ID": forged_tenant},
            json={"content": "owner-only memory"},
        )
        response = client.get(
            "/api/v1/memory/search?q=owner-only",
            headers={"X-Tenant-ID": forged_tenant},
        )
    assert created.status_code == 201
    assert response.status_code == 200
    assert response.json()[0]["memory_id"] == created.json()["memory_id"]


def test_memory_api_rejects_sensitive_metadata():
    with TestClient(app) as client:
        sensitive = client.post(
            "/api/v1/memory",
            json={"content": "safe", "metadata": {"password": "never-store"}},
        )
    assert sensitive.status_code == 422
