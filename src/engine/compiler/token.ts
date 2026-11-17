export type TokenKind =
  | "number"
  | "plus"
  | "minus"
  | "star"
  | "slash"
  | "left-paren"
  | "right-paren"
  | "eof";

export interface Token {
  readonly kind: TokenKind;
  readonly lexeme: string;
  readonly start: number;
  readonly end: number;
}
