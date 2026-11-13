"""Protected task API endpoints."""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from backend.app.auth.dependencies import require_api_token
from backend.app.dependencies import get_iq_engine
from backend.app.schemas.task import TaskCreate, TaskExecutionRead, TaskRead
from iq_core.kernel.iq_engine import IQEngine, IQTask

router = APIRouter(
    prefix="/api/v1/tasks",
    tags=["tasks"],
    dependencies=[Depends(require_api_token)],
)
EngineDep = Annotated[IQEngine, Depends(get_iq_engine)]


@router.post("", response_model=TaskRead, status_code=status.HTTP_201_CREATED)
def create_task(payload: TaskCreate, engine: EngineDep) -> TaskRead:
    task = IQTask(
        name=payload.name.strip(),
        objective=payload.objective.strip(),
        input_data=payload.input_data,
    )
    engine.submit(task)
    return TaskRead.model_validate(engine.get_task(task.task_id))


@router.get("/{task_id}", response_model=TaskRead)
def read_task(task_id: str, engine: EngineDep) -> TaskRead:
    try:
        return TaskRead.model_validate(engine.get_task(task_id))
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Task not found") from exc


@router.post("/{task_id}/execute", response_model=TaskExecutionRead)
def execute_task(task_id: str, engine: EngineDep) -> TaskExecutionRead:
    try:
        result = engine.execute(task_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Task not found") from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return TaskExecutionRead.model_validate(result)
