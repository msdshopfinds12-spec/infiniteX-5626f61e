import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parents[1] / "src"))
from getlang import compile_source

def test_compiles_to_data_only_plan():
    result = compile_source('let greeting = "hello"; emit greeting;')
    assert result.ok and result.plan is not None
    assert result.plan.effects == ()

def test_rejects_unknown_reference():
    result = compile_source("emit missing;")
    assert not result.ok and result.plan is None
    assert result.diagnostics[0].code == "GET-S001"

def test_rejects_duplicate_binding():
    result = compile_source("let x = 1; let x = 2;")
    assert not result.ok and result.diagnostics[0].code == "GET-S002"

def test_rejects_malformed_syntax():
    result = compile_source("let x = 1")
    assert not result.ok and result.diagnostics[0].code == "GET-P001"

def test_source_limit_fails_closed():
    result = compile_source("emit 1;", max_source_chars=2)
    assert not result.ok and result.diagnostics[0].code == "GET-C002"

def test_rejects_python_execution_payload():
    result = compile_source("emit __import__;")
    assert not result.ok and result.plan is None
