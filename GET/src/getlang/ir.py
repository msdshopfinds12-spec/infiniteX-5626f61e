from __future__ import annotations

from dataclasses import dataclass

from .ast.nodes import EmitStatement, LetStatement, Literal, Program, Reference, Span
from .typesystem import ValueType


@dataclass(frozen=True, slots=True)
class IRInstruction:
    opcode: str
    target: str | None
    operand: str | float | bool | None
    value_type: ValueType
    span: Span


def lower_to_ir(program: Program, symbols: dict[str, ValueType]) -> tuple[IRInstruction, ...]:
    instructions: list[IRInstruction] = []
    for statement in program.statements:
        if isinstance(statement, LetStatement):
            value_type = symbols[statement.name]
            if isinstance(statement.value, Literal):
                instructions.append(IRInstruction("CONST", statement.name, statement.value.value, value_type, statement.value.span))
            else:
                instructions.append(IRInstruction("COPY", statement.name, statement.value.name, value_type, statement.value.span))
        elif isinstance(statement, EmitStatement):
            if isinstance(statement.value, Literal):
                value_type = ValueType(statement.value.value_type)
                instructions.append(IRInstruction("EMIT_CONST", None, statement.value.value, value_type, statement.value.span))
            else:
                value_type = symbols[statement.value.name]
                instructions.append(IRInstruction("EMIT_REF", None, statement.value.name, value_type, statement.value.span))
    return tuple(instructions)
