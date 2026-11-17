import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parents[1] / "src"))
import pytest
from getlang.lexer.lexer import Lexer
from getlang.parser.errors import ParseError
from getlang.parser.parser import Parser

def test_parses_empty_program():
    assert Parser(Lexer("").scan()).parse().statements == ()

def test_requires_statement_keyword():
    with pytest.raises(ParseError):
        Parser(Lexer("unknown;").scan()).parse()
