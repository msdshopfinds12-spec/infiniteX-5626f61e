"""Protected tenant-scoped task API backed by persistent storage."""
from typing import Annotated
from uuid import UUID
from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session
from backend.app.auth.dependencies import require_api_token
from backend.app.dependencies import get_iq_engine
from backend.app.schemas.task import TaskCreate, TaskExecutionRead, TaskRead
from database.repositories.task_repository import TaskRepository
from database.session import get_db_session
from iq_core.kernel.iq_engine import IQEngine, IQTask, IQStatus

router = APIRouter(prefix="/api/v1/tasks", tags=["tasks"],
                   dependencies=[Depends(require_api_token)])
EngineDep = Annotated[IQEngine, Depends(get_iq_engine)]
SessionDep = Annotated[Session, Depends(get_db_session)]


def _repo(session: Session, tenant_header: str) -> TaskRepository:
    try:
        tenant_id = str(UUID(tenant_header))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="X-Tenant-ID must be a valid UUID") from exc
    return TaskRepository(session, tenant_id)


@router.post("", response_model=TaskRead, status_code=status.HTTP_201_CREATED)
def create_task(payload: TaskCreate, engine: EngineDep, session: SessionDep,
                x_tenant_id: Annotated[str, Header()]) -> TaskRead:
    repository = _repo(session, x_tenant_id)
    task = IQTask(name=payload.name.strip(), objective=payload.objective.strip(),
                  input_data=payload.input_data)
    record = repository.create(task_id=task.task_id, name=task.name,
                               objective=task.objective, input_data=task.input_data)
    return TaskRead.model_validate(record)


@router.get("/{task_id}", response_model=TaskRead)
def read_task(task_id: str, session: SessionDep,
              x_tenant_id: Annotated[str, Header()]) -> TaskRead:
    record = _repo(session, x_tenant_id).get(task_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return TaskRead.model_validate(record)


@router.post("/{task_id}/execute", response_model=TaskExecutionRead)
def execute_task(task_id: str, engine: EngineDep, session: SessionDep,
                 x_tenant_id: Annotated[str, Header()]) -> TaskExecutionRead:
    repository = _repo(session, x_tenant_id)
    record = repository.get(task_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Task not found")
    if record.status != IQStatus.PENDING.value:
        raise HTTPException(status_code=409, detail=f"Task cannot execute from {record.status}")
    if not repository.claim_for_execution(task_id):
        raise HTTPException(status_code=409, detail="Task is already claimed or not pending")
    task = IQTask(name=record.name, objective=record.objective,
                  input_data=record.input_data, task_id=record.task_id)
    try:
        engine.submit(task)
        result = engine.execute(task_id)
    except Exception as exc:
        repository.finish(task_id, status=IQStatus.NEEDS_REVIEW.value,
                          error="Execution interrupted; manual review required",
                          error_type=exc.__class__.__name__)
        raise HTTPException(status_code=500, detail="Task execution requires review") from exc
    repository.finish(task_id, status=result.status.value, result=result.output,
                      error=result.error, error_type=result.error_type,
                      finished_at=result.finished_at)
    return TaskExecutionRead.model_validate(result)
