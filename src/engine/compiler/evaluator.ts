import {
  addDecimal,
  divideDecimal,
  formatDecimal,
  multiplyDecimal,
  parseDecimal,
  subtractDecimal,
  type DecimalValue,
} from "../numeric/index.ts";
import { CompilerError } from "./errors.ts";
import type { Expression } from "./ast.ts";

export interface EvaluationOptions {
  readonly divisionPrecision?: number;
}

export function evaluateAst(expression: Expression, options: EvaluationOptions = {}): DecimalValue {
  const precision = options.divisionPrecision ?? 18;
  if (!Number.isInteger(precision) || precision < 0 || precision > 1_000) {
    throw new CompilerError("INVALID_DIVISION_PRECISION", "Division precision must be an integer from 0 to 1000.", 0);
  }

  const visit = (node: Expression): DecimalValue => {
    switch (node.kind) {
      case "literal":
        return parseDecimal(node.value);
      case "unary": {
        const value = visit(node.operand);
        return node.operator === "+"
          ? value
          : { coefficient: -value.coefficient, scale: value.scale };
      }
      case "binary": {
        const left = visit(node.left);
        const right = visit(node.right);
        switch (node.operator) {
          case "+": return addDecimal(left, right);
          case "-": return subtractDecimal(left, right);
          case "*": return multiplyDecimal(left, right);
          case "/": return divideDecimal(left, right, precision, "half-even");
        }
      }
    }
  };

  return visit(expression);
}

export function formatEvaluation(expression: Expression, options: EvaluationOptions = {}): string {
  return formatDecimal(evaluateAst(expression, options));
}
