export type CompilerErrorCode =
  | "SOURCE_TOO_LONG"
  | "TOO_MANY_TOKENS"
  | "UNEXPECTED_CHARACTER"
  | "INVALID_NUMBER"
  | "UNEXPECTED_TOKEN"
  | "EXPECTED_EXPRESSION"
  | "EXPECTED_CLOSING_PAREN"
  | "TRAILING_TOKEN"
  | "NESTING_LIMIT_EXCEEDED"
  | "INVALID_DIVISION_PRECISION"
  | "AST_INVALID"
  | "AST_LIMIT_EXCEEDED"
  | "IR_INVALID"
  | "IR_LIMIT_EXCEEDED";

export class CompilerError extends Error {
  readonly code: CompilerErrorCode;
  readonly offset: number;

  constructor(code: CompilerErrorCode, message: string, offset: number) {
    super(message);
    this.name = "CompilerError";
    this.code = code;
    this.offset = offset;
  }
}
