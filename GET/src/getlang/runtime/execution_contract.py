"""Declarative output contract. GET v0.1 does not execute plans."""
from dataclasses import dataclass
from ..ast.nodes import Program

@dataclass(frozen=True, slots=True)
class Plan:
    language_version: str
    program: Program
    effects: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        if self.effects:
            raise ValueError("GET v0.1 plans cannot declare executable effects")
