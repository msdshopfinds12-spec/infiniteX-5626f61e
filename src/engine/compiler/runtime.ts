import {
  addDecimal,
  divideDecimal,
  multiplyDecimal,
  parseDecimal,
  subtractDecimal,
  type DecimalValue,
} from "../numeric/index.ts";
import { CompilerError } from "./errors.ts";
import type { IntermediateRepresentation } from "./ir.ts";
import { verifyIR } from "./ir.ts";

export interface RuntimeOptions {
  readonly divisionPrecision?: number;
}

export function executeIR(ir: IntermediateRepresentation, options: RuntimeOptions = {}): DecimalValue {
  verifyIR(ir);
  const precision = options.divisionPrecision ?? 18;
  if (!Number.isInteger(precision) || precision < 0 || precision > 1_000) {
    throw new CompilerError("INVALID_DIVISION_PRECISION", "Division precision must be an integer from 0 to 1000.", 0);
  }

  const stack: DecimalValue[] = [];
  for (const instruction of ir.instructions) {
    switch (instruction.op) {
      case "constant":
        stack.push(parseDecimal(instruction.value));
        break;
      case "positive":
        if (stack.length < 1) throw new CompilerError("IR_INVALID", "Runtime stack underflow.", 0);
        break;
      case "negative": {
        const value = stack.pop();
        if (!value) throw new CompilerError("IR_INVALID", "Runtime stack underflow.", 0);
        stack.push({ coefficient: -value.coefficient, scale: value.scale });
        break;
      }
      case "add":
      case "subtract":
      case "multiply":
      case "divide": {
        const right = stack.pop();
        const left = stack.pop();
        if (!left || !right) throw new CompilerError("IR_INVALID", "Runtime stack underflow.", 0);
        const result = instruction.op === "add" ? addDecimal(left, right)
          : instruction.op === "subtract" ? subtractDecimal(left, right)
            : instruction.op === "multiply" ? multiplyDecimal(left, right)
              : divideDecimal(left, right, precision, "half-even");
        stack.push(result);
        break;
      }
      default:
        throw new CompilerError("IR_INVALID", "Runtime encountered an unknown operation.", 0);
    }
  }

  if (stack.length !== 1) throw new CompilerError("IR_INVALID", "Runtime did not finish with exactly one value.", 0);
  return stack[0];
}
