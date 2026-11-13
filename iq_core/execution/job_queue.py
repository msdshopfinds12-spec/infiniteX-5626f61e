"""Thread-safe in-memory job queue with explicit lifecycle transitions."""

from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from threading import RLock
from typing import Any
from uuid import uuid4


class JobStatus(str, Enum):
    QUEUED = "QUEUED"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    BLOCKED = "BLOCKED"
    DEAD_LETTER = "DEAD_LETTER"


@dataclass
class ExecutionJob:
    task_name: str
    objective: str
    payload: dict[str, Any] = field(default_factory=dict)
    job_id: str = field(default_factory=lambda: str(uuid4()))
    correlation_id: str = field(default_factory=lambda: str(uuid4()))
    status: JobStatus = JobStatus.QUEUED
    attempts: int = 0
    max_attempts: int = 3
    result: Any = None
    error: str | None = None
    error_type: str | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    scheduled_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    started_at: datetime | None = None
    finished_at: datetime | None = None
    attempt_task_ids: list[str] = field(default_factory=list)


class JobQueue:
    """Process-local queue; claims are atomic within this Python process."""

    def __init__(self) -> None:
        self._jobs: dict[str, ExecutionJob] = {}
        self._lock = RLock()

    def enqueue(self, job: ExecutionJob) -> ExecutionJob:
        if not job.task_name.strip():
            raise ValueError("Task name cannot be empty")
        if not job.objective.strip():
            raise ValueError("Task objective cannot be empty")
        if job.max_attempts < 1:
            raise ValueError("max_attempts must be at least 1")
        if job.scheduled_at.tzinfo is None:
            raise ValueError("scheduled_at must be timezone-aware")
        with self._lock:
            if job.job_id in self._jobs:
                raise ValueError(f"Duplicate job ID: {job.job_id}")
            self._jobs[job.job_id] = deepcopy(job)
            return deepcopy(self._jobs[job.job_id])

    def get(self, job_id: str) -> ExecutionJob:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                raise KeyError(f"Job not found: {job_id}")
            return deepcopy(job)

    def list_jobs(self) -> tuple[ExecutionJob, ...]:
        with self._lock:
            return tuple(deepcopy(job) for job in self._jobs.values())

    def claim_next(self, *, now: datetime | None = None) -> ExecutionJob | None:
        current = now or datetime.now(timezone.utc)
        if current.tzinfo is None:
            raise ValueError("now must be timezone-aware")
        with self._lock:
            ready = [
                job for job in self._jobs.values()
                if job.status is JobStatus.QUEUED and job.scheduled_at <= current
            ]
            if not ready:
                return None
            job = min(ready, key=lambda item: (item.scheduled_at, item.created_at))
            return self._claim(job)

    def claim(self, job_id: str, *, now: datetime | None = None) -> ExecutionJob | None:
        current = now or datetime.now(timezone.utc)
        if current.tzinfo is None:
            raise ValueError("now must be timezone-aware")
        with self._lock:
            job = self._jobs.get(job_id)
            if (
                job is None
                or job.status is not JobStatus.QUEUED
                or job.scheduled_at > current
            ):
                return None
            return self._claim(job)

    @staticmethod
    def _claim(job: ExecutionJob) -> ExecutionJob:
        job.status = JobStatus.RUNNING
        job.attempts += 1
        job.started_at = datetime.now(timezone.utc)
        return deepcopy(job)

    def record_attempt_task_id(self, job_id: str, task_id: str) -> ExecutionJob:
        with self._lock:
            job = self._require_running(job_id)
            job.attempt_task_ids.append(task_id)
            return deepcopy(job)

    def complete(self, job_id: str, result: Any) -> ExecutionJob:
        with self._lock:
            job = self._require_running(job_id)
            job.status = JobStatus.COMPLETED
            job.result = deepcopy(result)
            job.error = None
            job.error_type = None
            job.finished_at = datetime.now(timezone.utc)
            return deepcopy(job)

    def schedule_retry(
        self,
        job_id: str,
        *,
        scheduled_at: datetime,
        error: str,
        error_type: str,
    ) -> ExecutionJob:
        if scheduled_at.tzinfo is None:
            raise ValueError("scheduled_at must be timezone-aware")
        with self._lock:
            job = self._require_running(job_id)
            job.status = JobStatus.QUEUED
            job.scheduled_at = scheduled_at
            job.started_at = None
            job.error = error
            job.error_type = error_type
            return deepcopy(job)

    def fail(
        self,
        job_id: str,
        *,
        error: str,
        error_type: str,
        dead_letter: bool = False,
    ) -> ExecutionJob:
        with self._lock:
            job = self._require_running(job_id)
            job.status = JobStatus.DEAD_LETTER if dead_letter else JobStatus.FAILED
            job.error = error
            job.error_type = error_type
            job.finished_at = datetime.now(timezone.utc)
            return deepcopy(job)

    def block(self, job_id: str, *, error: str, error_type: str) -> ExecutionJob:
        with self._lock:
            job = self._require_running(job_id)
            job.status = JobStatus.BLOCKED
            job.error = error
            job.error_type = error_type
            job.finished_at = datetime.now(timezone.utc)
            return deepcopy(job)

    def _require_running(self, job_id: str) -> ExecutionJob:
        job = self._jobs.get(job_id)
        if job is None:
            raise KeyError(f"Job not found: {job_id}")
        if job.status is not JobStatus.RUNNING:
            raise RuntimeError(f"Job {job_id} is not RUNNING")
        return job
