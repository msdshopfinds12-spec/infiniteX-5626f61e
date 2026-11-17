import { CompilerError } from "./errors.ts";
import type { Expression } from "./ast.ts";
import type { Token } from "./token.ts";

const MAX_NESTING_DEPTH = 128;

class Parser {
  private current = 0;
  private nesting = 0;

  constructor(private readonly tokens: readonly Token[]) {}

  parse(): Expression {
    const expression = this.parseExpression();
    if (!this.check("eof")) {
      const token = this.peek();
      throw new CompilerError("TRAILING_TOKEN", `Unexpected trailing token '${token.lexeme}'.`, token.start);
    }
    return expression;
  }

  private parseExpression(): Expression {
    return this.parseBinary(0);
  }

  private parseBinary(minPrecedence: number): Expression {
    let left = this.parseUnary();
    while (true) {
      const token = this.peek();
      const precedence = token.kind === "plus" || token.kind === "minus"
        ? 1
        : token.kind === "star" || token.kind === "slash"
          ? 2
          : -1;
      if (precedence < minPrecedence) break;

      this.advance();
      const right = this.parseBinary(precedence + 1);
      const operator = token.kind === "plus" ? "+"
        : token.kind === "minus" ? "-"
          : token.kind === "star" ? "*" : "/";
      left = { kind: "binary", operator, left, right, start: left.start, end: right.end };
    }
    return left;
  }

  private parseUnary(): Expression {
    const token = this.peek();
    if (token.kind === "plus" || token.kind === "minus") {
      this.enter(token.start);
      this.advance();
      const operand = this.parseUnary();
      this.leave();
      return {
        kind: "unary",
        operator: token.kind === "plus" ? "+" : "-",
        operand,
        start: token.start,
        end: operand.end,
      };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Expression {
    const token = this.peek();
    if (token.kind === "number") {
      this.advance();
      return { kind: "literal", value: token.lexeme, start: token.start, end: token.end };
    }

    if (token.kind === "left-paren") {
      this.enter(token.start);
      this.advance();
      const expression = this.parseExpression();
      if (!this.check("right-paren")) {
        throw new CompilerError("EXPECTED_CLOSING_PAREN", "Expected a closing ')'.", this.peek().start);
      }
      const closing = this.advance();
      this.leave();
      return { ...expression, start: token.start, end: closing.end };
    }

    throw new CompilerError("EXPECTED_EXPRESSION", "Expected a number, unary sign, or parenthesized expression.", token.start);
  }

  private enter(offset: number): void {
    this.nesting += 1;
    if (this.nesting > MAX_NESTING_DEPTH) {
      throw new CompilerError("NESTING_LIMIT_EXCEEDED", "Expression nesting exceeds the 128-level limit.", offset);
    }
  }

  private leave(): void {
    this.nesting -= 1;
  }

  private check(kind: Token["kind"]): boolean {
    return this.peek().kind === kind;
  }

  private peek(): Token {
    return this.tokens[this.current];
  }

  private advance(): Token {
    const token = this.peek();
    if (token.kind !== "eof") this.current += 1;
    return token;
  }
}

export function parseTokens(tokens: readonly Token[]): Expression {
  if (tokens.length === 0) {
    throw new CompilerError("EXPECTED_EXPRESSION", "Token stream is empty.", 0);
  }
  return new Parser(tokens).parse();
}
