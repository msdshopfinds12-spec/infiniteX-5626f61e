from __future__ import annotations
from dataclasses import dataclass
from typing import TypeAlias

@dataclass(frozen=True, slots=True)
class Span:
    line: int
    column: int

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

@dataclass(frozen=True, slots=True)
class EmitStatement:
    value: Value
    span: Span

Statement: TypeAlias = LetStatement | EmitStatement

@dataclass(frozen=True, slots=True)
class Program:
    statements: tuple[Statement, ...]
