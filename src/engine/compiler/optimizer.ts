import {
  addDecimal,
  divideDecimal,
  formatDecimal,
  multiplyDecimal,
  parseDecimal,
  subtractDecimal,
} from "../numeric/index.ts";
import { CompilerError } from "./errors.ts";
import type { IntermediateRepresentation, IRInstruction } from "./ir.ts";
import { verifyIR } from "./ir.ts";

interface Fragment {
  readonly instructions: IRInstruction[];
  readonly constant?: string;
}

function foldBinary(op: "add" | "subtract" | "multiply" | "divide", left: string, right: string, divisionPrecision: number): string {
  const a = parseDecimal(left);
  const b = parseDecimal(right);
  switch (op) {
    case "add": return formatDecimal(addDecimal(a, b));
    case "subtract": return formatDecimal(subtractDecimal(a, b));
    case "multiply": return formatDecimal(multiplyDecimal(a, b));
    case "divide": return formatDecimal(divideDecimal(a, b, divisionPrecision, "half-even"));
  }
}

export function optimizeIR(ir: IntermediateRepresentation, divisionPrecision = 18): IntermediateRepresentation {
  if (!Number.isInteger(divisionPrecision) || divisionPrecision < 0 || divisionPrecision > 1_000) {
    throw new CompilerError("INVALID_DIVISION_PRECISION", "Division precision must be an integer from 0 to 1000.", 0);
  }
  verifyIR(ir);
  const stack: Fragment[] = [];

  for (const instruction of ir.instructions) {
    if (instruction.op === "constant") {
      stack.push({ instructions: [instruction], constant: instruction.value });
      continue;
    }

    if (instruction.op === "positive" || instruction.op === "negative") {
      const operand = stack.pop();
      if (!operand) throw new CompilerError("IR_INVALID", "Optimizer encountered unary stack underflow.", 0);
      if (operand.constant !== undefined) {
        const value = instruction.op === "negative"
          ? formatDecimal({ coefficient: -parseDecimal(operand.constant).coefficient, scale: parseDecimal(operand.constant).scale })
          : operand.constant;
        stack.push({ instructions: [{ op: "constant", value }], constant: value });
      } else {
        stack.push({ instructions: [...operand.instructions, instruction] });
      }
      continue;
    }

    const right = stack.pop();
    const left = stack.pop();
    if (!left || !right) throw new CompilerError("IR_INVALID", "Optimizer encountered binary stack underflow.", 0);

    if (left.constant !== undefined && right.constant !== undefined) {
      const value = foldBinary(instruction.op, left.constant, right.constant);
      stack.push({ instructions: [{ op: "constant", value }], constant: value });
    } else {
      stack.push({
        instructions: [...left.instructions, ...right.instructions, instruction],
      });
    }
  }

  if (stack.length !== 1) throw new CompilerError("IR_INVALID", "Optimizer produced an invalid stack.", 0);
  const optimized = { version: 1 as const, instructions: stack[0].instructions };
  verifyIR(optimized);
  return optimized;
}
