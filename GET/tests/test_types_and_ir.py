import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1] / "src"))

from getlang import compile_source


def test_infers_primitive_types_and_lowers_typed_ir():
    result = compile_source('let title: string = "GET"; let count: number = 3; emit title; emit count;')
    assert result.ok
    assert [item.value_type.value for item in result.typed_ir] == ["string", "number", "string", "number"]
    assert [item.opcode for item in result.typed_ir] == ["CONST", "CONST", "EMIT_REF", "EMIT_REF"]


def test_infers_boolean_and_null_types():
    result = compile_source("let enabled = true; let empty: null = null; emit enabled; emit empty;")
    assert result.ok
    assert [item.value_type.value for item in result.typed_ir] == ["boolean", "null", "boolean", "null"]


def test_rejects_annotation_mismatch():
    result = compile_source('let count: string = 42;')
    assert not result.ok and result.plan is None and result.typed_ir == ()
    assert result.diagnostics[0].code == "GET-T001"


def test_rejects_unknown_type_name():
    result = compile_source("let count: integer = 42;")
    assert not result.ok and result.diagnostics[0].code == "GET-T002"


def test_reference_inherits_declared_binding_type():
    result = compile_source('let first: string = "x"; let second: string = first; emit second;')
    assert result.ok
    assert [item.opcode for item in result.typed_ir] == ["CONST", "COPY", "EMIT_REF"]


def test_statement_limit_fails_closed():
    result = compile_source("emit 1; emit 2;", max_statements=1)
    assert not result.ok and result.plan is None
    assert result.diagnostics[0].code == "GET-P002"
