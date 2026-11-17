import { CompilerError } from "./errors.ts";

export type IRInstruction =
  | { readonly op: "constant"; readonly value: string }
  | { readonly op: "positive" | "negative" }
  | { readonly op: "add" | "subtract" | "multiply" | "divide" };

export interface IntermediateRepresentation {
  readonly version: 1;
  readonly instructions: readonly IRInstruction[];
}

const MAX_IR_INSTRUCTIONS = 8_000;
const MAX_IR_STACK = 4_000;

export function verifyIR(ir: IntermediateRepresentation): void {
  if (!ir || typeof ir !== "object" || ir.version !== 1 || !Array.isArray(ir.instructions)) {
    throw new CompilerError("IR_INVALID", "IR header or instruction list is invalid.", 0);
  }
  if (ir.instructions.length === 0 || ir.instructions.length > MAX_IR_INSTRUCTIONS) {
    throw new CompilerError("IR_LIMIT_EXCEEDED", "IR instruction count is outside the permitted range.", 0);
  }

  let stackDepth = 0;
  for (const instruction of ir.instructions) {
    if (!instruction || typeof instruction !== "object") {
      throw new CompilerError("IR_INVALID", "IR instruction must be an object.", 0);
    }
    switch (instruction.op) {
      case "constant":
        if (typeof instruction.value !== "string" ||
            !/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(instruction.value)) {
          throw new CompilerError("IR_INVALID", "IR constant must be a canonical decimal string.", 0);
        }
        stackDepth += 1;
        break;
      case "positive":
      case "negative":
        if (stackDepth < 1) throw new CompilerError("IR_INVALID", "Unary instruction causes stack underflow.", 0);
        break;
      case "add":
      case "subtract":
      case "multiply":
      case "divide":
        if (stackDepth < 2) throw new CompilerError("IR_INVALID", "Binary instruction causes stack underflow.", 0);
        stackDepth -= 1;
        break;
      default:
        throw new CompilerError("IR_INVALID", "Unknown IR operation.", 0);
    }
    if (stackDepth > MAX_IR_STACK) {
      throw new CompilerError("IR_LIMIT_EXCEEDED", "IR stack exceeds the configured limit.", 0);
    }
  }
  if (stackDepth !== 1) {
    throw new CompilerError("IR_INVALID", "IR must leave exactly one value on the stack.", 0);
  }
}
