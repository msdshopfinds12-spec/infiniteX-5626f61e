"""Deterministic plan construction; this module does not call an LLM."""
from dataclasses import dataclass
from uuid import uuid4


@dataclass(frozen=True)
class PlanStep:
    step_id: str
    description: str
    depends_on: tuple[str, ...] = ()


@dataclass(frozen=True)
class Plan:
    plan_id: str
    objective: str
    steps: tuple[PlanStep, ...]


class Planner:
    """Build a validated sequential plan from explicitly supplied steps."""

    def create_plan(self, objective: str, steps: list[str] | tuple[str, ...]) -> Plan:
        objective = objective.strip()
        normalized = tuple(step.strip() for step in steps if step.strip())
        if not objective:
            raise ValueError("Objective cannot be empty")
        if not normalized:
            raise ValueError("At least one plan step is required")
        built: list[PlanStep] = []
        previous: str | None = None
        for description in normalized:
            step_id = str(uuid4())
            built.append(PlanStep(
                step_id=step_id,
                description=description,
                depends_on=(previous,) if previous else (),
            ))
            previous = step_id
        return Plan(plan_id=str(uuid4()), objective=objective, steps=tuple(built))
