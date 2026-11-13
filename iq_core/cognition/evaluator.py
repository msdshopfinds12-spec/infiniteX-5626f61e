"""Transparent deterministic evaluation of plan execution outcomes."""
from dataclasses import dataclass

from iq_core.cognition.planner import Plan
from iq_core.cognition.reasoning_loop import StepOutcome


@dataclass(frozen=True)
class Evaluation:
    passed: bool
    completion_ratio: float
    completed_steps: int
    total_steps: int
    issues: tuple[str, ...]


class DecisionEvaluator:
    def evaluate(self, plan: Plan, outcomes: tuple[StepOutcome, ...]) -> Evaluation:
        completed = sum(1 for item in outcomes if item.status == "COMPLETED")
        issues = tuple(
            f"{item.status}: {item.error or item.step_id}"
            for item in outcomes if item.status != "COMPLETED"
        )
        total = len(plan.steps)
        ratio = completed / total if total else 0.0
        return Evaluation(
            passed=total > 0 and completed == total and not issues,
            completion_ratio=ratio,
            completed_steps=completed,
            total_steps=total,
            issues=issues,
        )
