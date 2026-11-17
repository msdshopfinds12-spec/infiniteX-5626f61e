from __future__ import annotations

import math
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

    def __post_init__(self) -> None:
        if self.opcode not in {"CONST", "COPY", "EMIT_CONST", "EMIT_REF"}:
            raise ValueError("Unsupported GET IR opcode")
        if not isinstance(self.value_type, ValueType):
            raise ValueError("IR value_type must be a ValueType")
        if self.opcode in {"CONST", "COPY"}:
            if not isinstance(self.target, str) or not self.target:
                raise ValueError("Binding instructions require a target")
        elif self.target is not None:
            raise ValueError("Emit instructions cannot have a target")
        if self.opcode in {"COPY", "EMIT_REF"}:
            if not isinstance(self.operand, str) or not self.operand:
                raise ValueError("Reference instructions require a binding name")
        else:
            valid = {
                ValueType.STRING: isinstance(self.operand, str),
                ValueType.NUMBER: isinstance(self.operand, float) and math.isfinite(self.operand),
                ValueType.BOOLEAN: isinstance(self.operand, bool),
                ValueType.NULL: self.operand is None,
            }[self.value_type]
            if not valid:
                raise ValueError("Constant operand does not match its declared type")


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
