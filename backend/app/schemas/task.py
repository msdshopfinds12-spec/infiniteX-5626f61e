"""Validated task API schemas."""
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from iq_core.kernel.iq_engine import IQStatus


class TaskCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100, pattern=r".*\S.*")
    objective: str = Field(min_length=1, max_length=4000, pattern=r".*\S.*")
    input_data: dict[str, Any] = Field(default_factory=dict)


class TaskRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    task_id: str
    name: str
    objective: str
    input_data: dict[str, Any]
    status: IQStatus
    result: Any = None
    error: str | None = None
    error_type: str | None = None
    created_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None
    attempts: int


class TaskExecutionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    task_id: str
    status: IQStatus
    output: Any = None
    error: str | None = None
    error_type: str | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None
    duration_ms: float | None = None
    attempt: int = 0
