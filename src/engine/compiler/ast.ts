export type Expression =
  | { readonly kind: "literal"; readonly value: string; readonly start: number; readonly end: number }
  | { readonly kind: "unary"; readonly operator: "+" | "-"; readonly operand: Expression; readonly start: number; readonly end: number }
  | { readonly kind: "binary"; readonly operator: "+" | "-" | "*" | "/"; readonly left: Expression; readonly right: Expression; readonly start: number; readonly end: number };
