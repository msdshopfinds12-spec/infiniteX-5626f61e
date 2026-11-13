"""Thread-safe in-memory task lifecycle engine for the INFINITEGX.7 IQ kernel.

Persistence, distributed queues, retries, cancellation, and scheduling are intentionally
deferred to their dedicated roadmap phases.
"""
from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from threading import RLock
from time import perf_counter
from typing import Any, Callable
from uuid import uuid4


class IQStatus(str, Enum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    BLOCKED = "BLOCKED"
    NEEDS_REVIEW = "NEEDS_REVIEW"


@dataclass
class IQTask:
    name: str
    objective: str
    input_data: dict[str, Any] = field(default_factory=dict)
    task_id: str = field(default_factory=lambda: str(uuid4()))
    status: IQStatus = IQStatus.PENDING
    result: Any = None
    error: str | None = None
    error_type: str | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    started_at: datetime | None = None
    finished_at: datetime | None = None
    attempts: int = 0


@dataclass(frozen=True)
class IQExecutionResult:
    task_id: str
    status: IQStatus
    output: Any = None
    error: str | None = None
    error_type: str | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None
    duration_ms: float | None = None
    attempt: int = 0


TaskHandler = Callable[[dict[str, Any]], Any]


class IQEngine:
    """Process-local task engine with guarded state transitions.

    This is a Phase 2 kernel foundation, not a durable or distributed queue.
    """

    def __init__(self) -> None:
        self._tasks: dict[str, IQTask] = {}
        self._handlers: dict[str, TaskHandler] = {}
        self._lock = RLock()

    @property
    def tasks(self) -> dict[str, IQTask]:
        with self._lock:
            return deepcopy(self._tasks)

    @property
    def handlers(self) -> dict[str, TaskHandler]:
        with self._lock:
            return dict(self._handlers)

    def register_handler(self, task_name: str, handler: TaskHandler) -> None:
        normalized_name = task_name.strip()
        if not normalized_name:
            raise ValueError("Task name cannot be empty")
        if not callable(handler):
            raise TypeError("Handler must be callable")
        with self._lock:
            if normalized_name in self._handlers:
                raise ValueError(f"Handler already registered: {normalized_name}")
            self._handlers[normalized_name] = handler

    def submit(self, task: IQTask) -> str:
        if not task.name.strip():
            raise ValueError("Task name cannot be empty")
        if not task.objective.strip():
            raise ValueError("Task objective cannot be empty")
        if task.status is not IQStatus.PENDING:
            raise ValueError("New tasks must start in PENDING state")
        with self._lock:
            if task.task_id in self._tasks:
                raise ValueError(f"Duplicate task ID: {task.task_id}")
            self._tasks[task.task_id] = deepcopy(task)
            return task.task_id

    def get_task(self, task_id: str) -> IQTask:
        with self._lock:
            task = self._tasks.get(task_id)
            if task is None:
                raise KeyError(f"Task not found: {task_id}")
            return deepcopy(task)

    def execute(self, task_id: str) -> IQExecutionResult:
        with self._lock:
            task = self._tasks.get(task_id)
            if task is None:
                raise KeyError(f"Task not found: {task_id}")
            if task.status is not IQStatus.PENDING:
                raise RuntimeError(f"Task cannot execute from {task.status.value}")
            handler = self._handlers.get(task.name)
            if handler is None:
                task.status = IQStatus.BLOCKED
                task.error = "No registered handler"
                task.error_type = "HandlerNotFound"
                task.finished_at = datetime.now(timezone.utc)
                return IQExecutionResult(
                    task_id=task_id, status=task.status, error=task.error,
                    error_type=task.error_type, finished_at=task.finished_at,
                )
            task.status = IQStatus.RUNNING
            task.started_at = datetime.now(timezone.utc)
            task.attempts += 1
            attempt = task.attempts
            handler_input = deepcopy(task.input_data)

        started_clock = perf_counter()
        try:
            output = handler(handler_input)
        except Exception as exc:
            finished_at = datetime.now(timezone.utc)
            duration_ms = (perf_counter() - started_clock) * 1000
            with self._lock:
                task = self._tasks[task_id]
                task.status = IQStatus.FAILED
                task.error = str(exc) or exc.__class__.__name__
                task.error_type = exc.__class__.__name__
                task.finished_at = finished_at
                return IQExecutionResult(
                    task_id=task_id, status=task.status, error=task.error,
                    error_type=task.error_type, started_at=task.started_at,
                    finished_at=finished_at, duration_ms=duration_ms, attempt=attempt,
                )

        finished_at = datetime.now(timezone.utc)
        duration_ms = (perf_counter() - started_clock) * 1000
        with self._lock:
            task = self._tasks[task_id]
            task.result = deepcopy(output)
            task.status = IQStatus.COMPLETED
            task.finished_at = finished_at
            return IQExecutionResult(
                task_id=task_id, status=task.status, output=deepcopy(output),
                started_at=task.started_at, finished_at=finished_at,
                duration_ms=duration_ms, attempt=attempt,
            )
