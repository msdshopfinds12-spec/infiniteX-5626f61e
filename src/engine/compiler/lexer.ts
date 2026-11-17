import { CompilerError } from "./errors.ts";
import type { Token, TokenKind } from "./token.ts";

const MAX_SOURCE_LENGTH = 10_000;
const MAX_TOKENS = 2_000;
const DECIMAL_LITERAL = /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;

export function tokenize(source: string): Token[] {
  if (typeof source !== "string") {
    throw new TypeError("Compiler source must be a string.");
  }
  if (source.length > MAX_SOURCE_LENGTH) {
    throw new CompilerError("SOURCE_TOO_LONG", "Source exceeds the 10,000-character limit.", MAX_SOURCE_LENGTH);
  }

  const tokens: Token[] = [];
  let cursor = 0;

  const add = (kind: TokenKind, start: number, end: number): void => {
    if (tokens.length >= MAX_TOKENS) {
      throw new CompilerError("TOO_MANY_TOKENS", "Source exceeds the 2,000-token limit.", start);
    }
    tokens.push({ kind, lexeme: source.slice(start, end), start, end });
  };

  while (cursor < source.length) {
    const char = source[cursor];
    if (/\s/.test(char)) {
      cursor += 1;
      continue;
    }

    const start = cursor;
    if (char >= "0" && char <= "9") {
      cursor += 1;
      while (cursor < source.length && source[cursor] >= "0" && source[cursor] <= "9") cursor += 1;
      if (source[cursor] === ".") {
        cursor += 1;
        const fractionStart = cursor;
        while (cursor < source.length && source[cursor] >= "0" && source[cursor] <= "9") cursor += 1;
        if (cursor === fractionStart) {
          throw new CompilerError("INVALID_NUMBER", "A decimal point must be followed by at least one digit.", start);
        }
      }
      const lexeme = source.slice(start, cursor);
      if (!DECIMAL_LITERAL.test(lexeme)) {
        throw new CompilerError("INVALID_NUMBER", "Invalid decimal literal; leading zeros and exponent notation are not supported.", start);
      }
      add("number", start, cursor);
      continue;
    }

    const kinds: Record<string, TokenKind> = {
      "+": "plus",
      "-": "minus",
      "*": "star",
      "/": "slash",
      "(": "left-paren",
      ")": "right-paren",
    };
    const kind = kinds[char];
    if (!kind) {
      throw new CompilerError("UNEXPECTED_CHARACTER", `Unexpected character '${char}'.`, cursor);
    }
    cursor += 1;
    add(kind, start, cursor);
  }

  tokens.push({ kind: "eof", lexeme: "", start: source.length, end: source.length });
  return tokens;
}
