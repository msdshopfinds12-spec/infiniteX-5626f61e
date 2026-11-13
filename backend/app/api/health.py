"""Public liveness and readiness endpoints."""
from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/health", summary="Basic API liveness")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "infinitegx7-api"}
