import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parents[1] / "src"))
import pytest
from getlang import compile_source
from getlang.ast.nodes import Program
from getlang.runtime.execution_contract import Plan

def test_no_plan_is_returned_for_lexical_failure():
    result = compile_source("emit 1; @")
    assert result.plan is None and not result.ok

def test_no_plan_is_returned_for_semantic_failure():
    result = compile_source("emit undeclared;")
    assert result.plan is None and not result.ok

def test_effectful_plan_is_forbidden():
    with pytest.raises(ValueError):
        Plan("0.1", Program(()), ("network",))
