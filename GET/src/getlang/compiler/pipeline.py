from dataclasses import dataclass
from ..ast.nodes import Program
from ..lexer.lexer import LexError, Lexer
from ..parser.parser import ParseError, Parser
from ..runtime.execution_contract import Plan
from ..validator.diagnostics import Diagnostic
from ..validator.semantic import validate

@dataclass(frozen=True, slots=True)
class CompileResult:
    ok: bool
    program: Program | None
    plan: Plan | None
    diagnostics: tuple[Diagnostic, ...]

def compile_source(source: str, *, max_source_chars: int = 100_000, max_tokens: int = 10_000) -> CompileResult:
    if not isinstance(source, str):
        return CompileResult(False, None, None, (Diagnostic("GET-C001", "error", "Source must be a string", 1, 1),))
    if len(source) > max_source_chars:
        return CompileResult(False, None, None, (Diagnostic("GET-C002", "error", "Source size limit exceeded", 1, 1),))
    try:
        tokens = Lexer(source, max_tokens=max_tokens).scan()
        program = Parser(tokens).parse()
    except (LexError, ParseError) as exc:
        return CompileResult(False, None, None, (Diagnostic(exc.code, "error", exc.message, exc.line, exc.column),))
    diagnostics = validate(program)
    if diagnostics:
        return CompileResult(False, program, None, diagnostics)
    return CompileResult(True, program, Plan("0.1", program), ())
