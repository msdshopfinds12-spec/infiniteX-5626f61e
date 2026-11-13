"""Authentication dependencies for protected API routes."""
import hmac
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status

from backend.app.config import Settings, get_settings


def require_api_token(
    authorization: Annotated[str | None, Header()] = None,
    settings: Settings = Depends(get_settings),
) -> None:
    """Require a configured bearer token; fail closed when no secret is configured."""
    if settings.api_auth_token is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="API authentication is not configured",
        )

    scheme, separator, supplied_token = (authorization or "").partition(" ")
    expected_token = settings.api_auth_token.get_secret_value()
    if (
        not separator
        or scheme.lower() != "bearer"
        or not supplied_token
        or not hmac.compare_digest(supplied_token, expected_token)
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )
