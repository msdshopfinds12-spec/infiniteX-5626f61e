from __future__ import annotations

import json
import math
import re

from .tokens import Token, TokenKind


class LexError(ValueError):
    def __init__(self, message: str, line: int, column: int, code: str = "GET-L001") -> None:
        super().__init__(message)
        self.message, self.line, self.column, self.code = message, line, column, code


_NUMBER = re.compile(r"-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?")
_IDENT = re.compile(r"[A-Za-z_][A-Za-z0-9_]*", re.ASCII)
_KEYWORDS = {
    "let": TokenKind.LET,
    "emit": TokenKind.EMIT,
    "true": TokenKind.TRUE,
    "false": TokenKind.FALSE,
    "null": TokenKind.NULL,
}


def _contains_surrogate(value: str) -> bool:
    return any(0xD800 <= ord(char) <= 0xDFFF for char in value)


class Lexer:
    def __init__(self, source: str, max_tokens: int = 10_000) -> None:
        if not isinstance(source, str):
            raise ValueError("source must be a string")
        if not isinstance(max_tokens, int) or isinstance(max_tokens, bool) or max_tokens < 1:
            raise ValueError("max_tokens must be a positive integer")
        self.source, self.max_tokens = source, max_tokens
        self.i, self.line, self.column = 0, 1, 1
        self.tokens: list[Token] = []

    def _advance(self) -> str:
        ch = self.source[self.i]
        self.i += 1
        if ch == "\n":
            self.line, self.column = self.line + 1, 1
        else:
            self.column += 1
        return ch

    def _add(self, kind: TokenKind, lexeme: str, value: object, line: int, column: int) -> None:
        if len(self.tokens) >= self.max_tokens:
            raise LexError("Token limit exceeded", line, column, "GET-L002")
        self.tokens.append(Token(kind, lexeme, value, line, column))

    def scan(self) -> tuple[Token, ...]:
        while self.i < len(self.source):
            ch = self.source[self.i]
            if ch in " \t\r":
                self._advance()
                continue
            if ch == "\n":
                self._advance()
                continue
            if ch == "#":
                while self.i < len(self.source) and self.source[self.i] != "\n":
                    self._advance()
                continue

            line, col, start = self.line, self.column, self.i
            if ch == '"':
                self._advance()
                escaped = False
                while self.i < len(self.source):
                    cur = self._advance()
                    if cur == '"' and not escaped:
                        break
                    if cur == "\\" and not escaped:
                        escaped = True
                    else:
                        escaped = False
                    if cur in "\r\n" and not escaped:
                        raise LexError("Newlines are not allowed inside strings", line, col)
                else:
                    raise LexError("Unterminated string literal", line, col)

                raw = self.source[start:self.i]
                try:
                    value = json.loads(raw)
                except (json.JSONDecodeError, ValueError) as exc:
                    raise LexError("Invalid string escape", line, col) from exc
                if not isinstance(value, str) or _contains_surrogate(value):
                    raise LexError("String must contain valid Unicode scalar values", line, col)
                self._add(TokenKind.STRING, raw, value, line, col)
                continue

            match = _NUMBER.match(self.source, self.i)
            if match:
                raw = match.group(0)
                self.i = match.end()
                self.column += len(raw)
                try:
                    value = float(raw)
                except (OverflowError, ValueError) as exc:
                    raise LexError("Invalid numeric literal", line, col) from exc
                if not math.isfinite(value):
                    raise LexError("Number must be finite", line, col)
                self._add(TokenKind.NUMBER, raw, value, line, col)
                continue

            match = _IDENT.match(self.source, self.i)
            if match:
                raw = match.group(0)
                self.i = match.end()
                self.column += len(raw)
                kind = _KEYWORDS.get(raw, TokenKind.IDENT)
                value = (
                    True if kind is TokenKind.TRUE
                    else False if kind is TokenKind.FALSE
                    else None if kind is TokenKind.NULL
                    else raw
                )
                self._add(kind, raw, value, line, col)
                continue

            single = {"=": TokenKind.EQUAL, ":": TokenKind.COLON, ";": TokenKind.SEMICOLON}
            if ch in single:
                self._advance()
                self._add(single[ch], ch, ch, line, col)
                continue
            raise LexError(f"Unexpected character {ch!r}", line, col)

        self._add(TokenKind.EOF, "", None, self.line, self.column)
        return tuple(self.tokens)
