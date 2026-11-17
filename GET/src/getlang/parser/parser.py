from __future__ import annotations

from ..ast.nodes import EmitStatement, LetStatement, Literal, Program, Reference, Span, Value
from ..lexer.tokens import Token, TokenKind


class ParseError(ValueError):
    def __init__(self, message: str, line: int, column: int, code: str = "GET-P001") -> None:
        super().__init__(message)
        self.message, self.line, self.column, self.code = message, line, column, code


class Parser:
    def __init__(self, tokens: tuple[Token, ...], *, max_statements: int = 10_000) -> None:
        if not isinstance(max_statements, int) or isinstance(max_statements, bool) or max_statements < 1:
            raise ValueError("max_statements must be a positive integer")
        self.tokens, self.i, self.max_statements = tokens, 0, max_statements

    def _peek(self) -> Token:
        return self.tokens[self.i]

    def _take(self) -> Token:
        token = self._peek()
        if token.kind is not TokenKind.EOF:
            self.i += 1
        return token

    def _expect(self, kind: TokenKind, message: str) -> Token:
        token = self._peek()
        if token.kind is not kind:
            raise ParseError(message, token.line, token.column)
        return self._take()

    def parse(self) -> Program:
        statements = []
        while self._peek().kind is not TokenKind.EOF:
            if len(statements) >= self.max_statements:
                token = self._peek()
                raise ParseError("Statement limit exceeded", token.line, token.column, "GET-P002")
            token = self._peek()
            if token.kind is TokenKind.LET:
                start = self._take()
                name = self._expect(TokenKind.IDENT, "Expected binding name")
                declared_type = None
                if self._peek().kind is TokenKind.COLON:
                    self._take()
                    declared_type = str(self._expect(TokenKind.IDENT, "Expected type name after ':'").value)
                self._expect(TokenKind.EQUAL, "Expected '=' after binding name or type")
                value = self._value()
                self._expect(TokenKind.SEMICOLON, "Expected ';' after let statement")
                statements.append(LetStatement(str(name.value), value, Span(start.line, start.column), declared_type))
            elif token.kind is TokenKind.EMIT:
                start = self._take()
                value = self._value()
                self._expect(TokenKind.SEMICOLON, "Expected ';' after emit statement")
                statements.append(EmitStatement(value, Span(start.line, start.column)))
            else:
                raise ParseError("Expected 'let' or 'emit' statement", token.line, token.column)
        return Program(tuple(statements))

    def _value(self) -> Value:
        token = self._take()
        span = Span(token.line, token.column)
        if token.kind is TokenKind.STRING:
            return Literal(token.value, "string", span)
        if token.kind is TokenKind.NUMBER:
            return Literal(token.value, "number", span)
        if token.kind in (TokenKind.TRUE, TokenKind.FALSE):
            return Literal(token.value, "boolean", span)
        if token.kind is TokenKind.NULL:
            return Literal(None, "null", span)
        if token.kind is TokenKind.IDENT:
            return Reference(str(token.value), span)
        raise ParseError("Expected literal or previously declared identifier", token.line, token.column)
