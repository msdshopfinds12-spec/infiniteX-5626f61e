"""Bounded context assembly with an injectable Company Brain retrieval function."""
from dataclasses import dataclass, field
from typing import Callable


@dataclass(frozen=True)
class CognitionContext:
    objective: str
    facts: tuple[str, ...] = ()
    memories: tuple[str, ...] = ()
    metadata: dict[str, str] = field(default_factory=dict)


class ContextBuilder:
    def __init__(self, memory_search: Callable[[str, int], list] | None = None) -> None:
        self.memory_search = memory_search

    def build(self, objective: str, *, facts: list[str] | None = None,
              memory_limit: int = 5) -> CognitionContext:
        objective = objective.strip()
        if not objective:
            raise ValueError("Objective cannot be empty")
        if not 0 <= memory_limit <= 20:
            raise ValueError("memory_limit must be between 0 and 20")
        retrieved: tuple[str, ...] = ()
        if self.memory_search is not None and memory_limit:
            results = self.memory_search(objective, memory_limit)
            retrieved = tuple(
                str(getattr(item, "content", item)) for item in results
            )
        clean_facts = tuple(str(item).strip() for item in (facts or []) if str(item).strip())
        return CognitionContext(objective=objective, facts=clean_facts, memories=retrieved)
