from ..ast.nodes import EmitStatement, LetStatement, Program, Reference, Value
from .diagnostics import Diagnostic

def validate(program: Program) -> tuple[Diagnostic, ...]:
    declared: set[str] = set()
    diagnostics: list[Diagnostic] = []

    def check(value: Value) -> None:
        if isinstance(value, Reference) and value.name not in declared:
            diagnostics.append(Diagnostic("GET-S001", "error", f"Unknown or forward reference: {value.name}", value.span.line, value.span.column))

    for statement in program.statements:
        if isinstance(statement, LetStatement):
            if statement.name in declared:
                diagnostics.append(Diagnostic("GET-S002", "error", f"Duplicate binding: {statement.name}", statement.span.line, statement.span.column))
            check(statement.value)
            declared.add(statement.name)
        elif isinstance(statement, EmitStatement):
            check(statement.value)
    return tuple(diagnostics)
