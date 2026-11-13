"""Validated sequential workflow execution over the queue-backed TaskEngine."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any
from uuid import uuid4

from iq_core.execution.job_queue import JobStatus
from iq_core.execution.task_engine import TaskEngine


@dataclass(frozen=True)
class WorkflowStep:
    step_id: str
    task_name: str
    objective: str
    payload: dict[str, Any] = field(default_factory=dict)
    depends_on: tuple[str, ...] = ()


@dataclass(frozen=True)
class WorkflowDefinition:
    name: str
    steps: tuple[WorkflowStep, ...]
    workflow_id: str = field(default_factory=lambda: str(uuid4()))


@dataclass(frozen=True)
class WorkflowStepResult:
    step_id: str
    status: str
    job_id: str | None = None
    output: Any = None
    error: str | None = None


@dataclass(frozen=True)
class WorkflowResult:
    workflow_id: str
    correlation_id: str
    status: str
    steps: tuple[WorkflowStepResult, ...]


class WorkflowEngine:
    @staticmethod
    def validate(definition: WorkflowDefinition) -> tuple[str, ...]:
        if not definition.name.strip():
            raise ValueError("Workflow name cannot be empty")
        if not definition.steps:
            raise ValueError("Workflow must contain at least one step")
        by_id: dict[str, WorkflowStep] = {}
        for step in definition.steps:
            if not step.step_id.strip() or not step.task_name.strip():
                raise ValueError("Workflow step ID and task name cannot be empty")
            if step.step_id in by_id:
                raise ValueError(f"Duplicate workflow step: {step.step_id}")
            by_id[step.step_id] = step
        for step in definition.steps:
            for dependency in step.depends_on:
                if dependency not in by_id:
                    raise ValueError(f"Unknown dependency: {dependency}")
                if dependency == step.step_id:
                    raise ValueError("Workflow step cannot depend on itself")

        remaining = {key: set(step.depends_on) for key, step in by_id.items()}
        ordered: list[str] = []
        while remaining:
            ready = [key for key, deps in remaining.items() if not deps]
            if not ready:
                raise ValueError("Workflow contains a dependency cycle")
            for key in ready:
                ordered.append(key)
                remaining.pop(key)
            for deps in remaining.values():
                deps.difference_update(ready)
        return tuple(ordered)

    def execute(
        self,
        definition: WorkflowDefinition,
        task_engine: TaskEngine,
        *,
        correlation_id: str | None = None,
    ) -> WorkflowResult:
        ordered_ids = self.validate(definition)
        steps = {step.step_id: step for step in definition.steps}
        root_correlation = correlation_id or str(uuid4())
        results: dict[str, WorkflowStepResult] = {}

        for step_id in ordered_ids:
            step = steps[step_id]
            failed_dependencies = [
                dependency for dependency in step.depends_on
                if results[dependency].status != JobStatus.COMPLETED.value
            ]
            if failed_dependencies:
                results[step_id] = WorkflowStepResult(
                    step_id=step_id,
                    status=JobStatus.BLOCKED.value,
                    error=f"Dependencies did not complete: {', '.join(failed_dependencies)}",
                )
                continue

            job = task_engine.submit(
                task_name=step.task_name,
                objective=step.objective,
                payload=step.payload,
                correlation_id=f"{root_correlation}:{step.step_id}",
            )
            attempt = task_engine.run_job(job.job_id)
            if attempt is None:
                current = task_engine.queue.get(job.job_id)
                results[step_id] = WorkflowStepResult(
                    step_id=step_id, status=current.status.value,
                    job_id=job.job_id, error=current.error,
                )
            else:
                results[step_id] = WorkflowStepResult(
                    step_id=step_id,
                    status=attempt.job.status.value,
                    job_id=job.job_id,
                    output=attempt.job.result,
                    error=attempt.job.error,
                )

        ordered_results = tuple(results[key] for key in ordered_ids)
        if all(item.status == JobStatus.COMPLETED.value for item in ordered_results):
            status = "COMPLETED"
        elif any(item.status == JobStatus.FAILED.value for item in ordered_results):
            status = "FAILED"
        elif any(item.status == JobStatus.DEAD_LETTER.value for item in ordered_results):
            status = "DEAD_LETTER"
        else:
            status = "NEEDS_REVIEW"
        return WorkflowResult(
            workflow_id=definition.workflow_id,
            correlation_id=root_correlation,
            status=status,
            steps=ordered_results,
        )
