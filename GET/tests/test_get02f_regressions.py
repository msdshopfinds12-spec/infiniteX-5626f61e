import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parents[1] / "src"))

from getlang import compile_source  # noqa: E402
from getlang.ast.nodes import Span  # noqa: E402
from getlang.ir import IRInstruction  # noqa: E402
from getlang.typesystem import ValueType  # noqa: E402


@pytest.mark.parametrize("line,column", [(0, 1), (1, 0), (-1, 1), (1, -1), (True, 1), (1, False)])
def test_span_rejects_non_positive_or_non_integer_coordinates(line, column):
    with pytest.raises(ValueError):
        Span(line, column)


def test_ir_accepts_finite_integer_numeric_constant():
    instruction = IRInstruction("CONST", "count", 7, ValueType.NUMBER, Span(1, 1))
    assert instruction.operand == 7


@pytest.mark.parametrize("value", [True, float("inf"), float("-inf"), float("nan")])
def test_ir_rejects_boolean_or_non_finite_number(value):
    with pytest.raises(ValueError):
        IRInstruction("CONST", "count", value, ValueType.NUMBER, Span(1, 1))


def test_ir_rejects_integer_outside_cross_language_safe_range():
    with pytest.raises(ValueError):
        IRInstruction("CONST", "count", 2**53, ValueType.NUMBER, Span(1, 1))


@pytest.mark.parametrize(
    "identifier", ["", "1starts_with_digit", "contains-dash", "space name", "éclair"]
)
def test_ir_rejects_invalid_binding_identifier(identifier):
    with pytest.raises(ValueError):
        IRInstruction("CONST", identifier, "x", ValueType.STRING, Span(1, 1))


def test_ir_rejects_invalid_reference_identifier():
    with pytest.raises(ValueError):
        IRInstruction("EMIT_REF", None, "not-valid", ValueType.STRING, Span(1, 1))


def test_ir_rejects_non_span_location():
    with pytest.raises(ValueError):
        IRInstruction("EMIT_CONST", None, "x", ValueType.STRING, None)  # type: ignore[arg-type]


def test_lexer_rejects_unpaired_unicode_surrogate_escape():
    result = compile_source(r'emit "\ud800";')
    assert not result.ok
    assert result.plan is None
    assert result.diagnostics[0].code == "GET-L001"


def test_lexer_accepts_valid_unicode_scalar_and_escaped_control():
    result = compile_source(r'emit "café \n ok";')
    assert result.ok
    assert result.typed_ir[0].operand == "café \n ok"


def test_huge_numeric_literal_fails_closed():
    result = compile_source("emit 9" + ("9" * 400) + ";")
    assert not result.ok
    assert result.plan is None
    assert result.diagnostics[0].code == "GET-L001"


@pytest.mark.parametrize(
    "kwargs",
    [
        {"max_source_chars": True},
        {"max_tokens": True},
        {"max_tokens": 0},
        {"max_statements": False},
        {"max_statements": 0},
    ],
)
def test_invalid_compiler_limits_return_diagnostic(kwargs):
    result = compile_source("emit 1;", **kwargs)
    assert not result.ok
    assert result.plan is None
    assert result.diagnostics[0].code == "GET-C003"


def test_token_budget_includes_eof_token():
    result = compile_source("emit 1;", max_tokens=3)
    assert not result.ok
    assert result.plan is None
    assert result.diagnostics[0].code == "GET-L002"


def test_statement_limit_boundary_is_enforced():
    result = compile_source("emit 1; emit 2;", max_statements=1)
    assert not result.ok
    assert result.plan is None
    assert result.diagnostics[0].code == "GET-P002"


def test_successful_compilation_has_no_partial_or_hidden_effects():
    result = compile_source('let x: string = "safe"; emit x;')
    assert result.ok
    assert result.plan is not None
    assert result.plan.effects == ()
    assert [item.opcode for item in result.typed_ir] == ["CONST", "EMIT_REF"]
