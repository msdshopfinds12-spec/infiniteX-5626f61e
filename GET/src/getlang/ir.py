from __future__ import annotations

import math
import re
from dataclasses import dataclass

from .ast.nodes import EmitStatement, LetStatement, Literal, Program, Reference, Span
from .typesystem import ValueType


_ALLOWED_OPCODES = frozenset({"CONST", "COPY", "EMIT_CONST", "EMIT_REF"})
_IDENTIFIER = re.compile(r"[A-Za-z_][A-Za-z0-9_]*\\Z", re.ASCII)
_MAX_SAFE_INTEGER = (2**53) - 1


def _valid_identifier(value: object) -> bool:
    return isinstance(value, str) and _IDENTIFIER.fullmatch(value) is not None


def _is_unicode_scalar_string(value: str) -> bool:
    return not any(0xD800 <= ord(char) <= 0xDFFF for char in value)


@dataclass(frozen=True, slots=True)
class IRInstruction:
    opcode: str
    target: str | None
    operand: str | int | float | bool | None
    value_type: ValueType
    span: Span

    def __post_init__(self) -> None:
        if not isinstance(self.opcode, str) or self.opcode not in _ALLOWED_OPCODES:
            raise ValueError("Unsupported GET IR opcode")
        if not isinstance(self.value_type, ValueType):
            raise ValueError("IR value_type must be a ValueType")
        if not isinstance(self.span, Span):
            raise ValueError("IR span must be a Span")

        is_binding = self.opcode in {"CONST", "COPY"}
        is_reference = self.opcode in {"COPY", "EMIT_REF"}

        if is_binding:
            if not _valid_identifier(self.target):
                raise ValueError("Binding instructions require a valid identifier target")
        elif self.target is not None:
            raise ValueError("Emit instructions cannot have a target")

        if is_reference:
            if not _valid_identifier(self.operand):
                raise ValueError("Reference instructions require a valid identifier operand")
            return

        if self.value_type is ValueType.STRING:
            valid = isinstance(self.operand, str) and _is_unicode_scalar_string(self.operand)
        elif self.value_type is ValueType.NUMBER:
            safe_integer = (
                isinstance(self.operand, int)
                and not isinstance(self.operand, bool)
                and abs(self.operand) <= _MAX_SAFE_INTEGER
            )
            finite_float = isinstance(self.operand, float) and math.isfinite(self.operand)
            valid = safe_integer or finite_float
        elif self.value_type is ValueType.BOOLEAN:
            valid = isinstance(self.operand, bool)
        else:
            valid = self.operand is None

        if not valid:
            raise ValueError("Constant operand does not match its declared type")


def lower_to_ir(program: Program, symbols: dict[str, ValueType]) -> tuple[IRInstruction, ...]:
    if not isinstance(program, Program) or not isinstance(symbols, dict):
        raise ValueError("IR lowering requires a Program and a symbol table")

    instructions: list[IRInstruction] = []
    for statement in program.statements:
        if isinstance(statement, LetStatement):
            value_type = symbols[statement.name]
            if isinstance(statement.value, Literal):
                instructions.append(
                    IRInstruction(
                        "CONST", statement.name, statement.value.value,
                        value_type, statement.value.span,
                    )
                )
            elif isinstance(statement.value, Reference):
                instructions.append(
                    IRInstruction(
                        "COPY", statement.name, statement.value.name,
                        value_type, statement.value.span,
                    )
                )
            else:
                raise ValueError("Unsupported value node during IR lowering")
        elif isinstance(statement, EmitStatement):
            if isinstance(statement.value, Literal):
                value_type = ValueType(statement.value.value_type)
                instructions.append(
                    IRInstruction(
                        "EMIT_CONST", None, statement.value.value,
                        value_type, statement.value.span,
                    )
                )
            elif isinstance(statement.value, Reference):
                value_type = symbols[statement.value.name]
                instructions.append(
                    IRInstruction(
                        "EMIT_REF", None, statement.value.name,
                        value_type, statement.value.span,
                    )
                )
            else:
                raise ValueError("Unsupported value node during IR lowering")
        else:
            raise ValueError("Unsupported statement node during IR lowering")
    return tuple(instructions)
