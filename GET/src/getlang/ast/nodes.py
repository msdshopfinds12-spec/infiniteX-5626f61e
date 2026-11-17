from __future__ import annotations

from dataclasses import dataclass
from typing import TypeAlias


@dataclass(frozen=True, slots=True)
class Span:
    line: int
    column: int

    def __post_init__(self) -> None:
        if (
            not isinstance(self.line, int)
            or isinstance(self.line, bool)
            or self.line < 1
            or not isinstance(self.column, int)
            or isinstance(self.column, bool)
            or self.column < 1
        ):
            raise ValueError("Source span line and column must be positive integers")


@dataclass(frozen=True, slots=True)
class Literal:
    value: str | float | bool | None
    value_type: str
    span: Span


@dataclass(frozen=True, slots=True)
class Reference:
    name: str
    span: Span


Value: TypeAlias = Literal | Reference


@dataclass(frozen=True, slots=True)
class LetStatement:
    name: str
    value: Value
    span: Span
    declared_type: str | None = None


@dataclass(frozen=True, slots=True)
class EmitStatement:
    value: Value
    span: Span


Statement: TypeAlias = LetStatement | EmitStatement


@dataclass(frozen=True, slots=True)
class Program:
    statements: tuple[Statement, ...]
