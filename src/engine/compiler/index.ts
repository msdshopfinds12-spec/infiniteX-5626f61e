export * from "./errors.ts";
export * from "./token.ts";
export * from "./lexer.ts";
export * from "./ast.ts";
export * from "./parser.ts";
export * from "./evaluator.ts";

import { tokenize } from "./lexer.ts";
import { parseTokens } from "./parser.ts";
import { evaluateAst, type EvaluationOptions } from "./evaluator.ts";
import type { Expression } from "./ast.ts";
import type { DecimalValue } from "../numeric/decimal.ts";

export function compileExpression(source: string): Expression {
  return parseTokens(tokenize(source));
}

export function evaluateExpression(source: string, options: EvaluationOptions = {}): DecimalValue {
  return evaluateAst(compileExpression(source), options);
}

export * from "./semantic.ts";
export * from "./ir.ts";
export * from "./lower.ts";
export * from "./optimizer.ts";
export * from "./runtime.ts";
export * from "./pipeline.ts";
export { formatDecimal } from "../numeric/index.ts";
