"""Bounded deterministic step runner; no autonomous model reasoning is implied."""
from dataclasses import dataclass
from typing import Callable

from iq_core.cognition.planner import Plan


@dataclass(frozen=True)
class StepOutcome:
    step_id: str
    status: str
    output: str | None = None
    error: str | None = None


class ReasoningLoop:
    def run(self, plan: Plan, executor: Callable[[str], str]) -> tuple[StepOutcome, ...]:
        outcomes: list[StepOutcome] = []
        completed: set[str] = set()
        for step in plan.steps:
            if any(dependency not in completed for dependency in step.depends_on):
                outcomes.append(StepOutcome(step.step_id, "BLOCKED",
                                            error="Dependency did not complete"))
                break
            try:
                output = executor(step.description)
            except Exception as exc:
                outcomes.append(StepOutcome(
                    step.step_id, "FAILED", error=str(exc) or exc.__class__.__name__
                ))
                break
            outcomes.append(StepOutcome(step.step_id, "COMPLETED", output=str(output)))
            completed.add(step.step_id)
        return tuple(outcomes)
