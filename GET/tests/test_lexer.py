import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parents[1] / "src"))
import pytest
from getlang.lexer.errors import LexError
from getlang.lexer.lexer import Lexer

def test_comments_and_tokens():
    tokens = Lexer('# comment\nemit true;').scan()
    assert [t.lexeme for t in tokens[:-1]] == ["emit", "true", ";"]

def test_unexpected_character_rejected():
    with pytest.raises(LexError):
        Lexer("emit @;").scan()

def test_token_budget_enforced():
    with pytest.raises(LexError):
        Lexer("emit 1;", max_tokens=2).scan()

def test_unterminated_string_rejected():
    with pytest.raises(LexError):
        Lexer('emit "oops;').scan()
