"""Queue-backed task execution using the existing IQEngine handler contract."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from iq_core.execution.event_engine import EventEngine, ExecutionEvent
from iq_core.execution.job_queue import ExecutionJob, JobQueue, JobStatus
from iq_core.execution.retry_manager import RetryManager
from iq_core.kernel.iq_engine import IQEngine, IQExecutionResult, IQStatus, IQTask


@dataclass(frozen=True)
class ExecutionAttempt:
    job: ExecutionJob
    kernel_result: IQExecutionResult


class TaskEngine:
    """Synchronous worker facade over an in-memory queue and the IQ kernel."""

    def __init__(
        self,
        *,
        kernel: IQEngine | None = None,
        queue: JobQueue | None = None,
        retry_manager: RetryManager | None = None,
        events: EventEngine | None = None,
    ) -> None:
        self.kernel = kernel or IQEngine()
        self.queue = queue or JobQueue()
        self.retry_manager = retry_manager or RetryManager()
        self.events = events or EventEngine()

    def register_handler(self, task_name: str, handler: Any) -> None:
        self.kernel.register_handler(task_name, handler)

    def submit(
        self,
        *,
        task_name: str,
        objective: str,
        payload: dict[str, Any] | None = None,
        correlation_id: str | None = None,
        max_attempts: int | None = None,
        scheduled_at: datetime | None = None,
    ) -> ExecutionJob:
        job = ExecutionJob(
            task_name=task_name,
            objective=objective,
            payload=dict(payload or {}),
            correlation_id=correlation_id or str(uuid4()),
            max_attempts=max_attempts or self.retry_manager.max_attempts,
            scheduled_at=scheduled_at or datetime.now(timezone.utc),
        )
        created = self.queue.enqueue(job)
        self._emit("job.queued", created, {"attempt": 0})
        return created

    def run_next(self, *, now: datetime | None = None) -> ExecutionAttempt | None:
        job = self.queue.claim_next(now=now)
        if job is None:
            return None
        return self._execute_claimed(job, now=now)

    def run_job(
        self, job_id: str, *, now: datetime | None = None
    ) -> ExecutionAttempt | None:
        job = self.queue.claim(job_id, now=now)
        if job is None:
            return None
        return self._execute_claimed(job, now=now)

    def _execute_claimed(
        self, job: ExecutionJob, *, now: datetime | None
    ) -> ExecutionAttempt:
        self._emit("job.started", job, {"attempt": job.attempts})
        kernel_task = IQTask(
            name=job.task_name,
            objective=job.objective,
            input_data={
                "payload": job.payload,
                "correlation_id": job.correlation_id,
                "job_id": job.job_id,
                "attempt": job.attempts,
            },
        )
        self.queue.record_attempt_task_id(job.job_id, kernel_task.task_id)
        try:
            self.kernel.submit(kernel_task)
            result = self.kernel.execute(kernel_task.task_id)
        except Exception as exc:
            result = IQExecutionResult(
                task_id=kernel_task.task_id,
                status=IQStatus.FAILED,
                error=str(exc) or exc.__class__.__name__,
                error_type=exc.__class__.__name__,
            )

        if result.status is IQStatus.COMPLETED:
            final_job = self.queue.complete(job.job_id, result.output)
            self._emit("job.completed", final_job, {"attempt": job.attempts})
        elif result.status is IQStatus.BLOCKED:
            final_job = self.queue.block(
                job.job_id,
                error=result.error or "Task is blocked",
                error_type=result.error_type or "TaskBlocked",
            )
            self._emit("job.blocked", final_job, {"attempt": job.attempts})
        else:
            retry_at = self.retry_manager.next_retry_at(
                attempt=job.attempts,
                now=now or datetime.now(timezone.utc),
            )
            if retry_at is not None and job.attempts < job.max_attempts:
                final_job = self.queue.schedule_retry(
                    job.job_id,
                    scheduled_at=retry_at,
                    error=result.error or "Task failed",
                    error_type=result.error_type or "TaskFailed",
                )
                self._emit(
                    "job.retry_scheduled",
                    final_job,
                    {"attempt": job.attempts, "retry_at": retry_at.isoformat()},
                )
            else:
                final_job = self.queue.fail(
                    job.job_id,
                    error=result.error or "Task failed",
                    error_type=result.error_type or "TaskFailed",
                    dead_letter=True,
                )
                self._emit("job.dead_lettered", final_job, {"attempt": job.attempts})

        return ExecutionAttempt(job=final_job, kernel_result=result)

    def _emit(self, event_type: str, job: ExecutionJob, payload: dict[str, Any]) -> None:
        self.events.publish(ExecutionEvent(
            event_type=event_type,
            aggregate_id=job.job_id,
            correlation_id=job.correlation_id,
            payload=payload,
        ))
