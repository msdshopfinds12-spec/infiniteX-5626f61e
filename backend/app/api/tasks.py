"""Protected owner-scoped task API backed by persistent storage."""
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, Response, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.app.auth.dependencies import CurrentPrincipal, get_current_principal
from backend.app.dependencies import get_iq_engine
from backend.app.idempotency import task_id_for_idempotency_key, task_record_matches_request
from backend.app.schemas.task import TaskCreate, TaskExecutionRead, TaskRead
from database.repositories.task_repository import TaskRepository
from database.session import get_db_session
from iq_core.kernel.iq_engine import IQEngine, IQTask, IQStatus

router = APIRouter(
    prefix="/api/v1/tasks",
    tags=["tasks"],
    dependencies=[Depends(get_current_principal)],
)
EngineDep = Annotated[IQEngine, Depends(get_iq_engine)]
SessionDep = Annotated[Session, Depends(get_db_session)]
PrincipalDep = Annotated[CurrentPrincipal, Depends(get_current_principal)]


def _repo(session: Session, tenant_id: str) -> TaskRepository:
    return TaskRepository(session, tenant_id)


@router.post("", response_model=TaskRead, status_code=status.HTTP_201_CREATED)
def create_task(
    payload: TaskCreate,
    engine: EngineDep,
    session: SessionDep,
    principal: PrincipalDep,
    response: Response,
    idempotency_key: Annotated[
        str | None, Header(alias="Idempotency-Key")
    ] = None,
) -> TaskRead:
    del engine  # Task creation persists work; execution is a separate explicit operation.
    repository = _repo(session, principal.tenant_id)
    name, objective = payload.name.strip(), payload.objective.strip()
    try:
        task_id = (
            task_id_for_idempotency_key(principal.tenant_id, idempotency_key)
            if idempotency_key is not None
            else str(uuid4())
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        record = repository.create(
            task_id=task_id,
            name=name,
            objective=objective,
            input_data=payload.input_data,
        )
    except IntegrityError as exc:
        session.rollback()
        if idempotency_key is None:
            raise HTTPException(status_code=409, detail="Task creation conflict") from exc
        existing = repository.get(task_id)
        if existing is None:
            raise HTTPException(status_code=409, detail="Task creation conflict") from exc
        if not task_record_matches_request(
            existing, name=name, objective=objective, input_data=payload.input_data
        ):
            raise HTTPException(
                status_code=409,
                detail="Idempotency-Key was already used with a different request",
            ) from exc
        response.status_code = status.HTTP_200_OK
        return TaskRead.model_validate(existing)

    return TaskRead.model_validate(record)


@router.get("/{task_id}", response_model=TaskRead)
def read_task(task_id: str, session: SessionDep, principal: PrincipalDep) -> TaskRead:
    record = _repo(session, principal.tenant_id).get(task_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return TaskRead.model_validate(record)


@router.post("/{task_id}/execute", response_model=TaskExecutionRead)
def execute_task(
    task_id: str,
    engine: EngineDep,
    session: SessionDep,
    principal: PrincipalDep,
) -> TaskExecutionRead:
    repository = _repo(session, principal.tenant_id)
    record = repository.get(task_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Task not found")
    if record.status != IQStatus.PENDING.value:
        raise HTTPException(
            status_code=409, detail=f"Task cannot execute from {record.status}"
        )
    if not repository.claim_for_execution(task_id):
        raise HTTPException(status_code=409, detail="Task is already claimed or not pending")
    task = IQTask(
        name=record.name,
        objective=record.objective,
        input_data=record.input_data,
        task_id=record.task_id,
    )
    try:
        engine.submit(task)
        result = engine.execute(task_id)
    except Exception as exc:
        repository.finish(
            task_id,
            status=IQStatus.NEEDS_REVIEW.value,
            error="Execution interrupted; manual review required",
            error_type=exc.__class__.__name__,
        )
        raise HTTPException(
            status_code=500, detail="Task execution requires review"
        ) from exc
    repository.finish(
        task_id,
        status=result.status.value,
        result=result.output,
        error=result.error,
        error_type=result.error_type,
        finished_at=result.finished_at,
    )
    return TaskExecutionRead.model_validate(result)
