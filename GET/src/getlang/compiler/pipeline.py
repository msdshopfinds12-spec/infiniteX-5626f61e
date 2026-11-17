from dataclasses import dataclass

from ..ast.nodes import Program
from ..ir import IRInstruction, lower_to_ir
from ..lexer.lexer import LexError, Lexer
from ..parser.parser import ParseError, Parser
from ..runtime.execution_contract import Plan
from ..typesystem import ValueType
from ..validator.diagnostics import Diagnostic
from ..validator.semantic import analyze


@dataclass(frozen=True, slots=True)
class CompileResult:
    ok: bool
    program: Program | None
    plan: Plan | None
    diagnostics: tuple[Diagnostic, ...]
    typed_ir: tuple[IRInstruction, ...] = ()


def compile_source(
    source: str, *, max_source_chars: int = 100_000, max_tokens: int = 10_000,
    max_statements: int = 10_000,
) -> CompileResult:
    if not isinstance(source, str):
        return CompileResult(False, None, None, (Diagnostic("GET-C001", "error", "Source must be a string", 1, 1),))
    if not isinstance(max_source_chars, int) or isinstance(max_source_chars, bool) or max_source_chars < 0:
        return CompileResult(False, None, None, (Diagnostic("GET-C003", "error", "Invalid source limit", 1, 1),))
    if len(source) > max_source_chars:
        return CompileResult(False, None, None, (Diagnostic("GET-C002", "error", "Source size limit exceeded", 1, 1),))
    try:
        tokens = Lexer(source, max_tokens=max_tokens).scan()
        program = Parser(tokens, max_statements=max_statements).parse()
    except (LexError, ParseError) as exc:
        return CompileResult(False, None, None, (Diagnostic(exc.code, "error", exc.message, exc.line, exc.column),))
    except ValueError as exc:
        return CompileResult(False, None, None, (Diagnostic("GET-C003", "error", str(exc), 1, 1),))
    diagnostics, symbols = analyze(program)
    if diagnostics:
        return CompileResult(False, program, None, diagnostics)
    typed_ir = lower_to_ir(program, symbols)
    return CompileResult(True, program, Plan("0.2", program), (), typed_ir)
