from types import SimpleNamespace

import pytest

from iq_core.cognition import (
    ContextBuilder, DecisionEvaluator, Planner, ReasoningLoop, ReflectionEngine,
)


def test_planner_builds_sequential_dependencies():
    plan = Planner().create_plan("Ship feature", ["Design", "Implement", "Test"])
    assert len(plan.steps) == 3
    assert plan.steps[0].depends_on == ()
    assert plan.steps[1].depends_on == (plan.steps[0].step_id,)
    assert plan.steps[2].depends_on == (plan.steps[1].step_id,)


def test_planner_rejects_empty_input():
    with pytest.raises(ValueError):
        Planner().create_plan(" ", ["step"])
    with pytest.raises(ValueError):
        Planner().create_plan("objective", [])


def test_context_builder_connects_to_memory_retrieval():
    calls = []
    def search(query, limit):
        calls.append((query, limit))
        return [SimpleNamespace(content="Relevant prior decision")]
    context = ContextBuilder(search).build("Build cognition", facts=["Verified fact"])
    assert calls == [("Build cognition", 5)]
    assert context.memories == ("Relevant prior decision",)
    assert context.facts == ("Verified fact",)


def test_reasoning_loop_completes_and_evaluator_passes():
    plan = Planner().create_plan("Run", ["one", "two"])
    outcomes = ReasoningLoop().run(plan, lambda step: f"done:{step}")
    evaluation = DecisionEvaluator().evaluate(plan, outcomes)
    assert evaluation.passed is True
    assert evaluation.completion_ratio == 1.0


def test_reasoning_loop_stops_after_failure():
    plan = Planner().create_plan("Run", ["one", "two", "three"])
    def execute(step):
        if step == "two":
            raise RuntimeError("deliberate failure")
        return "ok"
    outcomes = ReasoningLoop().run(plan, execute)
    evaluation = DecisionEvaluator().evaluate(plan, outcomes)
    assert [item.status for item in outcomes] == ["COMPLETED", "FAILED"]
    assert evaluation.passed is False
    assert evaluation.completed_steps == 1


def test_reflection_recommends_review_after_failure():
    plan = Planner().create_plan("Run", ["one"])
    outcomes = ReasoningLoop().run(plan, lambda _: (_ for _ in ()).throw(ValueError("no")))
    evaluation = DecisionEvaluator().evaluate(plan, outcomes)
    reflection = ReflectionEngine().reflect(plan, outcomes, evaluation)
    assert reflection.successful is False
    assert "revise" in reflection.recommended_next_action


def test_context_builder_enforces_memory_bound():
    with pytest.raises(ValueError):
        ContextBuilder().build("objective", memory_limit=21)
