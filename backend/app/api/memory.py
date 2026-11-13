"""Tenant-scoped Company Brain API."""
from typing import Annotated, Any
from uuid import UUID
from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from backend.app.auth.dependencies import require_api_token
from database.session import get_db_session
from iq_core.memory.company_brain import CompanyBrain, MemoryInput

router = APIRouter(prefix="/api/v1/memory", tags=["memory"],
                   dependencies=[Depends(require_api_token)])
SessionDep = Annotated[Session, Depends(get_db_session)]


class MemoryCreate(BaseModel):
    content: str = Field(min_length=1, max_length=20_000)
    source: str = Field(default="user", max_length=100)
    metadata: dict[str, Any] = Field(default_factory=dict)


class MemoryRead(BaseModel):
    memory_id: str
    content: str
    source: str
    metadata: dict[str, Any]
    created_at: str


class MemorySearchRead(BaseModel):
    memory_id: str
    content: str
    source: str
    metadata: dict[str, Any]
    score: float
    created_at: str


def _brain(session: Session, tenant_header: str) -> CompanyBrain:
    try:
        tenant_id = str(UUID(tenant_header))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="X-Tenant-ID must be a valid UUID") from exc
    return CompanyBrain(session, tenant_id)


@router.post("", response_model=MemoryRead, status_code=201)
def create_memory(payload: MemoryCreate, session: SessionDep,
                  x_tenant_id: Annotated[str, Header()]) -> MemoryRead:
    try:
        record = _brain(session, x_tenant_id).remember(MemoryInput(
            content=payload.content, source=payload.source, metadata=payload.metadata))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return MemoryRead(memory_id=record.memory_id, content=record.content,
                      source=record.source, metadata=record.metadata_json,
                      created_at=record.created_at.isoformat())


@router.get("/search", response_model=list[MemorySearchRead])
def search_memory(session: SessionDep, x_tenant_id: Annotated[str, Header()],
                  q: str = Query(min_length=1, max_length=1000),
                  limit: int = Query(default=10, ge=1, le=100)) -> list[MemorySearchRead]:
    try:
        results = _brain(session, x_tenant_id).search(q, limit)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return [MemorySearchRead(memory_id=item.memory_id, content=item.content,
            source=item.source, metadata=item.metadata, score=item.score,
            created_at=item.created_at.isoformat()) for item in results]
