"""Structured post-run reflection from observed outcomes, not model-generated insight."""
from dataclasses import dataclass

from iq_core.cognition.evaluator import Evaluation
from iq_core.cognition.planner import Plan
from iq_core.cognition.reasoning_loop import StepOutcome


@dataclass(frozen=True)
class Reflection:
    summary: str
    successful: bool
    lessons: tuple[str, ...]
    recommended_next_action: str


class ReflectionEngine:
    def reflect(self, plan: Plan, outcomes: tuple[StepOutcome, ...],
                evaluation: Evaluation) -> Reflection:
        lessons = tuple(
            f"{item.status}: {item.error or item.output or item.step_id}"
            for item in outcomes
        )
        if evaluation.passed:
            summary = f"Completed all {evaluation.total_steps} steps for: {plan.objective}"
            next_action = "Review the outputs before approving any external action."
        else:
            summary = (
                f"Completed {evaluation.completed_steps}/{evaluation.total_steps} "
                f"steps for: {plan.objective}"
            )
            next_action = "Inspect failed or blocked steps, then revise and rerun the plan."
        return Reflection(summary, evaluation.passed, lessons, next_action)
