import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1] / "src"))

import pytest

from getlang import compile_source
from getlang.ir import IRInstruction
from getlang.ast.nodes import Span
from getlang.typesystem import ValueType


def test_failed_type_check_never_emits_plan_or_ir():
    result = compile_source("let value: boolean = 1; emit value;")
    assert result.plan is None
    assert result.typed_ir == ()
    assert not result.ok


def test_source_limit_configuration_is_validated():
    result = compile_source("emit 1;", max_source_chars=-1)
    assert not result.ok and result.diagnostics[0].code == "GET-C003"


def test_ir_uses_only_closed_data_opcodes():
    result = compile_source('let x = "safe"; emit x;')
    assert result.ok
    assert {item.opcode for item in result.typed_ir} <= {"CONST", "COPY", "EMIT_CONST", "EMIT_REF"}
    assert all(not callable(item.operand) for item in result.typed_ir)


def test_ir_rejects_unknown_opcode():
    with pytest.raises(ValueError):
        IRInstruction("CALL", None, "danger", ValueType.STRING, Span(1, 1))


def test_ir_rejects_callable_constant_operand():
    with pytest.raises(ValueError):
        IRInstruction("EMIT_CONST", None, print, ValueType.STRING, Span(1, 1))


def test_ir_rejects_mismatched_constant_type():
    with pytest.raises(ValueError):
        IRInstruction("CONST", "flag", 1.0, ValueType.BOOLEAN, Span(1, 1))
