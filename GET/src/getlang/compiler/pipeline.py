from dataclasses import dataclass

from ..ast.nodes import Program
from ..ir import IRInstruction, lower_to_ir
from ..lexer.lexer import LexError, Lexer
from ..parser.parser import ParseError, Parser
from ..runtime.execution_contract import Plan
from ..validator.diagnostics import Diagnostic
from ..validator.semantic import analyze


@dataclass(frozen=True, slots=True)
class CompileResult:
    ok: bool
    program: Program | None
    plan: Plan | None
    diagnostics: tuple[Diagnostic, ...]
    typed_ir: tuple[IRInstruction, ...] = ()


def _failure(code: str, message: str, line: int = 1, column: int = 1) -> CompileResult:
    return CompileResult(False, None, None, (Diagnostic(code, "error", message, line, column),))


def compile_source(
    source: str,
    *,
    max_source_chars: int = 100_000,
    max_tokens: int = 10_000,
    max_statements: int = 10_000,
) -> CompileResult:
    if not isinstance(source, str):
        return _failure("GET-C001", "Source must be a string")
    if (
        not isinstance(max_source_chars, int)
        or isinstance(max_source_chars, bool)
        or max_source_chars < 0
    ):
        return _failure("GET-C003", "Invalid source limit")
    if len(source) > max_source_chars:
        return _failure("GET-C002", "Source size limit exceeded")

    try:
        tokens = Lexer(source, max_tokens=max_tokens).scan()
        program = Parser(tokens, max_statements=max_statements).parse()
    except (LexError, ParseError) as exc:
        return _failure(exc.code, exc.message, exc.line, exc.column)
    except ValueError as exc:
        return _failure("GET-C003", str(exc))

    try:
        diagnostics, symbols = analyze(program)
        if diagnostics:
            return CompileResult(False, program, None, diagnostics)
        typed_ir = lower_to_ir(program, symbols)
        plan = Plan("0.2", program)
    except (AttributeError, KeyError, TypeError, ValueError) as exc:
        # Defensive boundary: malformed internal structures must not produce a partial plan.
        return _failure("GET-C004", f"Invalid compiler structure: {type(exc).__name__}")

    return CompileResult(True, program, plan, (), typed_ir)
