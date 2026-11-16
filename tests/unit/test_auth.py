from types import SimpleNamespace
from uuid import UUID

import jwt
import pytest
from fastapi import HTTPException
from jwt.exceptions import PyJWKClientConnectionError

import backend.app.auth.dependencies as auth
from backend.app.config import Settings

TENANT = UUID("11111111-1111-4111-8111-111111111111")


class FakeJwksClient:
    def get_signing_key_from_jwt(self, token):
        assert token == "signed-token"
        return SimpleNamespace(key="verified-public-key")


def configured_settings():
    return Settings(
        jwt_jwks_url="https://identity.example/.well-known/jwks.json",
        jwt_issuer="https://identity.example/",
        jwt_audience="infinitegx-api",
        owner_subject="owner-subject-123",
        owner_tenant_id=TENANT,
    )


def test_valid_signed_owner_token_returns_server_bound_principal(monkeypatch):
    claims = {
        "sub": "owner-subject-123",
        "iss": "https://identity.example/",
        "aud": "infinitegx-api",
        "exp": 2_000_000_000,
    }
    monkeypatch.setattr(auth, "_get_jwks_client", lambda _: FakeJwksClient())
    monkeypatch.setattr(auth.jwt, "decode", lambda *args, **kwargs: claims)

    principal = auth.get_current_principal(
        authorization="Bearer signed-token",
        settings=configured_settings(),
    )

    assert principal.subject == "owner-subject-123"
    assert principal.tenant_id == str(TENANT)


def test_missing_identity_configuration_fails_closed():
    with pytest.raises(HTTPException) as error:
        auth.get_current_principal(
            authorization="Bearer signed-token",
            settings=Settings(),
        )
    assert error.value.status_code == 503


def test_missing_bearer_token_is_rejected():
    with pytest.raises(HTTPException) as error:
        auth.get_current_principal(
            authorization=None,
            settings=configured_settings(),
        )
    assert error.value.status_code == 401


def test_non_owner_subject_is_forbidden(monkeypatch):
    claims = {
        "sub": "different-subject",
        "iss": "https://identity.example/",
        "aud": "infinitegx-api",
        "exp": 2_000_000_000,
    }
    monkeypatch.setattr(auth, "_get_jwks_client", lambda _: FakeJwksClient())
    monkeypatch.setattr(auth.jwt, "decode", lambda *args, **kwargs: claims)

    with pytest.raises(HTTPException) as error:
        auth.get_current_principal(
            authorization="Bearer signed-token",
            settings=configured_settings(),
        )
    assert error.value.status_code == 403


def test_invalid_signature_is_rejected(monkeypatch):
    monkeypatch.setattr(auth, "_get_jwks_client", lambda _: FakeJwksClient())

    def reject_signature(*args, **kwargs):
        raise jwt.InvalidSignatureError("invalid signature")

    monkeypatch.setattr(auth.jwt, "decode", reject_signature)
    with pytest.raises(HTTPException) as error:
        auth.get_current_principal(
            authorization="Bearer signed-token",
            settings=configured_settings(),
        )
    assert error.value.status_code == 401


def test_identity_provider_outage_fails_closed(monkeypatch):
    class OfflineJwksClient:
        def get_signing_key_from_jwt(self, token):
            raise PyJWKClientConnectionError("identity provider offline")

    monkeypatch.setattr(auth, "_get_jwks_client", lambda _: OfflineJwksClient())
    with pytest.raises(HTTPException) as error:
        auth.get_current_principal(
            authorization="Bearer signed-token",
            settings=configured_settings(),
        )
    assert error.value.status_code == 503
