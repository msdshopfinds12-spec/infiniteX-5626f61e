import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1] / "src"))

from getlang import compile_source


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
