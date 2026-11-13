"""Manual-poll one-shot scheduler; no background thread or auto-activation."""

from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass, field
from datetime import datetime, timezone
from threading import RLock
from typing import Any
from uuid import uuid4

from iq_core.execution.task_engine import TaskEngine


@dataclass
class ScheduledTask:
    task_name: str
    objective: str
    run_at: datetime
    payload: dict[str, Any] = field(default_factory=dict)
    scheduled_id: str = field(default_factory=lambda: str(uuid4()))
    correlation_id: str = field(default_factory=lambda: str(uuid4()))
    status: str = "SCHEDULED"
    submitted_job_id: str | None = None


class Scheduler:
    """Stores one-shot schedules in memory; callers explicitly poll due tasks."""

    def __init__(self) -> None:
        self._tasks: dict[str, ScheduledTask] = {}
        self._lock = RLock()

    def schedule_once(self, task: ScheduledTask) -> ScheduledTask:
        if not task.task_name.strip() or not task.objective.strip():
            raise ValueError("Scheduled task name and objective are required")
        if task.run_at.tzinfo is None:
            raise ValueError("run_at must be timezone-aware")
        with self._lock:
            if task.scheduled_id in self._tasks:
                raise ValueError(f"Duplicate schedule ID: {task.scheduled_id}")
            self._tasks[task.scheduled_id] = deepcopy(task)
            return deepcopy(task)

    def list_schedules(self) -> tuple[ScheduledTask, ...]:
        with self._lock:
            return tuple(deepcopy(item) for item in self._tasks.values())

    def dispatch_due(
        self, task_engine: TaskEngine, *, now: datetime | None = None
    ) -> tuple[str, ...]:
        current = now or datetime.now(timezone.utc)
        if current.tzinfo is None:
            raise ValueError("now must be timezone-aware")
        submitted: list[str] = []
        with self._lock:
            due = [
                item for item in self._tasks.values()
                if item.status == "SCHEDULED" and item.run_at <= current
            ]
            for item in due:
                job = task_engine.submit(
                    task_name=item.task_name,
                    objective=item.objective,
                    payload=item.payload,
                    correlation_id=item.correlation_id,
                    scheduled_at=item.run_at,
                )
                item.status = "SUBMITTED"
                item.submitted_job_id = job.job_id
                submitted.append(job.job_id)
        return tuple(submitted)
