from datetime import datetime, timedelta, timezone

import pytest

from iq_core.execution.event_engine import EventEngine, ExecutionEvent
from iq_core.execution.job_queue import ExecutionJob, JobQueue, JobStatus
from iq_core.execution.retry_manager import RetryManager
from iq_core.execution.scheduler import ScheduledTask, Scheduler
from iq_core.execution.task_engine import TaskEngine
from iq_core.execution.workflow_engine import (
    WorkflowDefinition,
    WorkflowEngine,
    WorkflowStep,
)
from iq_core.kernel.iq_engine import IQStatus

NOW = datetime(2026, 11, 13, 9, 0, tzinfo=timezone.utc)


def test_queue_claims_due_job_and_prevents_second_claim() -> None:
    queue = JobQueue()
    job = queue.enqueue(ExecutionJob(task_name="echo", objective="Queue claim"))
    claimed = queue.claim(job.job_id, now=NOW)
    assert claimed is not None and claimed.status is JobStatus.RUNNING
    assert claimed.attempts == 1
    assert queue.claim(job.job_id, now=NOW) is None


def test_queue_does_not_claim_future_job() -> None:
    queue = JobQueue()
    job = queue.enqueue(ExecutionJob(
        task_name="echo", objective="Not due", scheduled_at=NOW + timedelta(minutes=5)
    ))
    assert queue.claim_next(now=NOW) is None
    assert queue.get(job.job_id).status is JobStatus.QUEUED


def test_queue_rejects_naive_schedule_time() -> None:
    with pytest.raises(ValueError, match="timezone-aware"):
        JobQueue().enqueue(ExecutionJob(
            task_name="echo", objective="Bad time", scheduled_at=datetime(2026, 11, 13)
        ))


def test_retry_policy_uses_bounded_exponential_backoff() -> None:
    retry = RetryManager(max_attempts=4, base_delay_seconds=2, max_delay_seconds=5)
    assert retry.next_retry_at(attempt=1, now=NOW) == NOW + timedelta(seconds=2)
    assert retry.next_retry_at(attempt=2, now=NOW) == NOW + timedelta(seconds=4)
    assert retry.next_retry_at(attempt=3, now=NOW) == NOW + timedelta(seconds=5)
    assert retry.next_retry_at(attempt=4, now=NOW) is None


def test_retry_policy_rejects_invalid_configuration() -> None:
    with pytest.raises(ValueError, match="max_attempts"):
        RetryManager(max_attempts=0)


def test_event_engine_records_and_delivers_correlated_events() -> None:
    events = EventEngine()
    received = []
    events.subscribe("task.done", received.append)
    event = ExecutionEvent("task.done", "job-1", "corr-1", {"ok": True})
    events.publish(event)
    assert events.history(aggregate_id="job-1")[0].correlation_id == "corr-1"
    assert received[0].payload == {"ok": True}


def test_event_subscriber_failure_does_not_drop_event() -> None:
    events = EventEngine()
    def broken(_: ExecutionEvent) -> None:
        raise RuntimeError("subscriber failed")
    events.subscribe("task.done", broken)
    events.publish(ExecutionEvent("task.done", "job-1", "corr-1"))
    assert len(events.history()) == 1
    assert events.delivery_errors()[0]["handler_error_type"] == "RuntimeError"


def test_task_engine_completes_job_and_emits_lifecycle_events() -> None:
    engine = TaskEngine()
    engine.register_handler("echo", lambda data: {"received": data["payload"]["value"]})
    job = engine.submit(task_name="echo", objective="Execute", payload={"value": 7},
                        correlation_id="corr-task")
    attempt = engine.run_job(job.job_id, now=NOW)
    assert attempt is not None
    assert attempt.kernel_result.status is IQStatus.COMPLETED
    assert attempt.job.status is JobStatus.COMPLETED
    assert attempt.job.result == {"received": 7}
    assert len(attempt.job.attempt_task_ids) == 1
    assert [event.event_type for event in engine.events.history(aggregate_id=job.job_id)] == [
        "job.queued", "job.started", "job.completed"
    ]


def test_task_engine_retries_then_completes_with_distinct_kernel_task_ids() -> None:
    retry = RetryManager(max_attempts=3, base_delay_seconds=2)
    engine = TaskEngine(retry_manager=retry)
    calls = {"count": 0}
    def flaky(_: dict) -> str:
        calls["count"] += 1
        if calls["count"] == 1:
            raise RuntimeError("temporary")
        return "recovered"
    engine.register_handler("flaky", flaky)
    job = engine.submit(task_name="flaky", objective="Retry", max_attempts=3)
    first = engine.run_job(job.job_id, now=NOW)
    assert first is not None and first.job.status is JobStatus.QUEUED
    assert first.job.attempts == 1
    second = engine.run_job(job.job_id, now=NOW + timedelta(seconds=2))
    assert second is not None and second.job.status is JobStatus.COMPLETED
    assert second.job.attempts == 2
    assert second.job.result == "recovered"
    assert len(second.job.attempt_task_ids) == 2
    assert len(set(second.job.attempt_task_ids)) == 2


def test_task_engine_dead_letters_after_attempt_limit() -> None:
    engine = TaskEngine(retry_manager=RetryManager(max_attempts=2, base_delay_seconds=1))
    engine.register_handler("broken", lambda _: (_ for _ in ()).throw(ValueError("nope")))
    job = engine.submit(task_name="broken", objective="Dead letter", max_attempts=2)
    first = engine.run_job(job.job_id, now=NOW)
    assert first is not None and first.job.status is JobStatus.QUEUED
    second = engine.run_job(job.job_id, now=NOW + timedelta(seconds=1))
    assert second is not None and second.job.status is JobStatus.DEAD_LETTER
    assert second.job.error == "nope"


def test_task_engine_blocks_when_handler_is_missing() -> None:
    engine = TaskEngine()
    job = engine.submit(task_name="missing", objective="Blocked")
    result = engine.run_job(job.job_id, now=NOW)
    assert result is not None and result.job.status is JobStatus.BLOCKED


def test_workflow_engine_executes_steps_in_dependency_order() -> None:
    engine = TaskEngine()
    calls = []
    engine.register_handler("step", lambda data: calls.append(data["payload"]["step"]) or "ok")
    workflow = WorkflowDefinition(name="chain", steps=(
        WorkflowStep("second", "step", "Second", {"step": "second"}, ("first",)),
        WorkflowStep("first", "step", "First", {"step": "first"}),
    ))
    result = WorkflowEngine().execute(workflow, engine, correlation_id="corr-flow")
    assert result.status == "COMPLETED"
    assert calls == ["first", "second"]
    assert [item.status for item in result.steps] == ["COMPLETED", "COMPLETED"]


def test_workflow_engine_blocks_dependents_after_failure() -> None:
    engine = TaskEngine(retry_manager=RetryManager(max_attempts=1))
    engine.register_handler("ok", lambda _: "ok")
    engine.register_handler("fail", lambda _: (_ for _ in ()).throw(RuntimeError("failed")))
    workflow = WorkflowDefinition(name="blocked-chain", steps=(
        WorkflowStep("start", "fail", "Fail"),
        WorkflowStep("next", "ok", "Must not run", depends_on=("start",)),
    ))
    result = WorkflowEngine().execute(workflow, engine)
    assert result.status == "DEAD_LETTER"
    assert result.steps[0].status == "DEAD_LETTER"
    assert result.steps[1].status == "BLOCKED"


def test_workflow_validation_rejects_cycles_and_missing_dependencies() -> None:
    cyclic = WorkflowDefinition(name="cycle", steps=(
        WorkflowStep("a", "echo", "A", depends_on=("b",)),
        WorkflowStep("b", "echo", "B", depends_on=("a",)),
    ))
    with pytest.raises(ValueError, match="cycle"):
        WorkflowEngine.validate(cyclic)
    missing = WorkflowDefinition(name="missing", steps=(
        WorkflowStep("a", "echo", "A", depends_on=("absent",)),
    ))
    with pytest.raises(ValueError, match="Unknown dependency"):
        WorkflowEngine.validate(missing)


def test_scheduler_dispatches_due_schedule_once() -> None:
    scheduler = Scheduler()
    engine = TaskEngine()
    engine.register_handler("echo", lambda _: "ok")
    item = scheduler.schedule_once(ScheduledTask(
        task_name="echo", objective="Run at due time", run_at=NOW + timedelta(minutes=2)
    ))
    assert scheduler.dispatch_due(engine, now=NOW) == ()
    submitted = scheduler.dispatch_due(engine, now=NOW + timedelta(minutes=2))
    assert len(submitted) == 1
    assert scheduler.dispatch_due(engine, now=NOW + timedelta(minutes=3)) == ()
    stored = next(x for x in scheduler.list_schedules() if x.scheduled_id == item.scheduled_id)
    assert stored.status == "SUBMITTED"
    assert stored.submitted_job_id == submitted[0]
