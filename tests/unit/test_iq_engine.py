from threading import Event, Thread

import pytest

from iq_core.kernel.iq_engine import IQEngine, IQStatus, IQTask


def test_task_executes_successfully() -> None:
    engine = IQEngine()
    engine.register_handler("research", lambda data: {"accepted": True, "input": data})
    task_id = engine.submit(IQTask(
        name="research", objective="Test research execution",
        input_data={"topic": "infiniteGX.7"},
    ))
    result = engine.execute(task_id)
    assert result.task_id == task_id
    assert result.status is IQStatus.COMPLETED
    assert result.output == {"accepted": True, "input": {"topic": "infiniteGX.7"}}
    assert result.duration_ms is not None
    stored = engine.get_task(task_id)
    assert stored.status is IQStatus.COMPLETED
    assert stored.attempts == 1
    assert stored.started_at is not None and stored.finished_at is not None


def test_missing_handler_blocks_task() -> None:
    engine = IQEngine()
    task_id = engine.submit(IQTask(name="unknown", objective="Missing handler test"))
    result = engine.execute(task_id)
    assert result.status is IQStatus.BLOCKED
    assert result.error_type == "HandlerNotFound"
    assert engine.get_task(task_id).status is IQStatus.BLOCKED


def test_handler_exception_marks_task_failed_without_raising() -> None:
    engine = IQEngine()
    def fail(_: dict) -> None:
        raise RuntimeError("provider unavailable")
    engine.register_handler("research", fail)
    task_id = engine.submit(IQTask(name="research", objective="Failure path"))
    result = engine.execute(task_id)
    assert result.status is IQStatus.FAILED
    assert result.error == "provider unavailable"
    assert result.error_type == "RuntimeError"
    assert engine.get_task(task_id).status is IQStatus.FAILED


def test_duplicate_task_id_is_rejected() -> None:
    engine = IQEngine()
    task = IQTask(name="research", objective="Duplicate")
    engine.submit(task)
    with pytest.raises(ValueError, match="Duplicate task ID"):
        engine.submit(task)


def test_unknown_task_id_raises_key_error() -> None:
    with pytest.raises(KeyError, match="Task not found"):
        IQEngine().execute("missing")


def test_task_cannot_execute_twice() -> None:
    engine = IQEngine()
    engine.register_handler("research", lambda _: "ok")
    task_id = engine.submit(IQTask(name="research", objective="Single execution"))
    engine.execute(task_id)
    with pytest.raises(RuntimeError, match="cannot execute"):
        engine.execute(task_id)


def test_concurrent_execution_is_rejected_while_task_is_running() -> None:
    engine = IQEngine()
    started, release = Event(), Event()
    def blocking_handler(_: dict) -> str:
        started.set()
        assert release.wait(timeout=5)
        return "done"
    engine.register_handler("blocking", blocking_handler)
    task_id = engine.submit(IQTask(name="blocking", objective="Concurrency guard"))
    results = []
    worker = Thread(target=lambda: results.append(engine.execute(task_id)))
    worker.start()
    assert started.wait(timeout=5)
    with pytest.raises(RuntimeError, match="cannot execute"):
        engine.execute(task_id)
    release.set()
    worker.join(timeout=5)
    assert not worker.is_alive()
    assert results[0].status is IQStatus.COMPLETED


def test_submitted_task_is_copied_to_prevent_caller_mutation() -> None:
    engine = IQEngine()
    original = IQTask(name="echo", objective="Defensive copy", input_data={"value": 1})
    task_id = engine.submit(original)
    original.input_data["value"] = 999
    assert engine.get_task(task_id).input_data == {"value": 1}


def test_task_validation_rejects_blank_objective() -> None:
    with pytest.raises(ValueError, match="objective"):
        IQEngine().submit(IQTask(name="research", objective="  "))
