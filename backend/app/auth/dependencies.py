"""Fail-closed JWT authentication for the configured single owner."""
from __future__ import annotations

import hmac
from dataclasses import dataclass
from functools import lru_cache
from typing import Annotated
from urllib.parse import urlparse
from uuid import UUID

import jwt
from fastapi import Depends, Header, HTTPException, status
from jwt import PyJWKClient
from jwt.exceptions import PyJWKClientConnectionError, PyJWKClientError

from backend.app.config import Settings, get_settings


@dataclass(frozen=True)
class CurrentPrincipal:
    """Identity established by a trusted JWT and bound to the configured owner tenant."""

    subject: str
    tenant_id: str


@lru_cache(maxsize=4)
def _get_jwks_client(jwks_url: str) -> PyJWKClient:
    """Cache trusted JWKS clients; never accept a JWKS URL from a request."""
    return PyJWKClient(jwks_url, cache_keys=True, cache_jwk_set=True, timeout=5)


def _auth_unavailable() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Owner authentication is not configured",
    )


def get_current_principal(
    authorization: Annotated[str | None, Header()] = None,
    settings: Settings = Depends(get_settings),
) -> CurrentPrincipal:
    """Verify issuer, audience, signature, expiry and exact owner subject.

    Tenant identity is server-configured. X-Tenant-ID and request-body tenant fields
    are deliberately not read or trusted.
    """
    required = (
        settings.jwt_jwks_url,
        settings.jwt_issuer,
        settings.jwt_audience,
        settings.owner_subject,
        settings.owner_tenant_id,
    )
    if not all(required):
        raise _auth_unavailable()

    parsed = urlparse(settings.jwt_jwks_url or "")
    if not parsed.hostname or parsed.scheme not in {"https", "http"}:
        raise _auth_unavailable()
    if parsed.scheme != "https" and parsed.hostname not in {"localhost", "127.0.0.1", "::1"}:
        raise _auth_unavailable()
    if settings.environment.lower() == "production" and parsed.scheme != "https":
        raise _auth_unavailable()

    scheme, separator, token = (authorization or "").partition(" ")
    if (
        not separator
        or scheme.lower() != "bearer"
        or not token
        or token.strip() != token
        or " " in token
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        signing_key = _get_jwks_client(settings.jwt_jwks_url).get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            audience=settings.jwt_audience,
            issuer=settings.jwt_issuer,
            options={"require": ["exp", "sub", "iss", "aud"]},
        )
    except PyJWKClientConnectionError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Trusted identity provider is temporarily unavailable",
        ) from exc
    except (PyJWKClientError, jwt.InvalidTokenError, TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    subject = claims.get("sub")
    if not isinstance(subject, str) or not hmac.compare_digest(subject, settings.owner_subject):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This identity is not authorized for this private system",
        )

    try:
        tenant_id = str(UUID(str(settings.owner_tenant_id)))
    except (TypeError, ValueError) as exc:
        raise _auth_unavailable() from exc

    return CurrentPrincipal(subject=subject, tenant_id=tenant_id)
