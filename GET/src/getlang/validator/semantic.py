from __future__ import annotations

from ..ast.nodes import EmitStatement, LetStatement, Program, Reference, Value
from ..typesystem import PRIMITIVE_TYPES, ValueType
from .diagnostics import Diagnostic


def analyze(program: Program) -> tuple[tuple[Diagnostic, ...], dict[str, ValueType]]:
    symbols: dict[str, ValueType] = {}
    diagnostics: list[Diagnostic] = []

    def resolve(value: Value) -> ValueType | None:
        if isinstance(value, Reference):
            value_type = symbols.get(value.name)
            if value_type is None:
                diagnostics.append(Diagnostic(
                    "GET-S001", "error", f"Unknown or forward reference: {value.name}",
                    value.span.line, value.span.column,
                ))
            return value_type
        return ValueType(value.value_type)

    for statement in program.statements:
        if isinstance(statement, LetStatement):
            if statement.name in symbols:
                diagnostics.append(Diagnostic(
                    "GET-S002", "error", f"Duplicate binding: {statement.name}",
                    statement.span.line, statement.span.column,
                ))
                resolve(statement.value)
                continue
            inferred = resolve(statement.value)
            if statement.declared_type is not None and statement.declared_type not in PRIMITIVE_TYPES:
                diagnostics.append(Diagnostic(
                    "GET-T002", "error", f"Unknown type: {statement.declared_type}",
                    statement.span.line, statement.span.column,
                ))
                continue
            if inferred is not None and statement.declared_type is not None:
                declared = ValueType(statement.declared_type)
                if inferred is not declared:
                    diagnostics.append(Diagnostic(
                        "GET-T001", "error",
                        f"Type mismatch for '{statement.name}': expected {declared.value}, got {inferred.value}",
                        statement.span.line, statement.span.column,
                    ))
                    continue
            if inferred is not None:
                symbols[statement.name] = inferred
        elif isinstance(statement, EmitStatement):
            resolve(statement.value)
    return tuple(diagnostics), symbols


def validate(program: Program) -> tuple[Diagnostic, ...]:
    return analyze(program)[0]
