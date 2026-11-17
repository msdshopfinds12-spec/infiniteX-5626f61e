from dataclasses import dataclass
from enum import Enum, auto

class TokenKind(Enum):
    LET = auto()
    EMIT = auto()
    TRUE = auto()
    FALSE = auto()
    NULL = auto()
    IDENT = auto()
    STRING = auto()
    NUMBER = auto()
    EQUAL = auto()
    SEMICOLON = auto()
    EOF = auto()

@dataclass(frozen=True, slots=True)
class Token:
    kind: TokenKind
    lexeme: str
    value: object
    line: int
    column: int
