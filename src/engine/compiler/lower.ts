import type { Expression } from "./ast.ts";
import { CompilerError } from "./errors.ts";
import type { IntermediateRepresentation, IRInstruction } from "./ir.ts";
import { analyzeExpression } from "./semantic.ts";

const OPERATION_MAP = {
  "+": "add",
  "-": "subtract",
  "*": "multiply",
  "/": "divide",
} as const;

export function lowerToIR(root: Expression): IntermediateRepresentation {
  analyzeExpression(root);
  const instructions: IRInstruction[] = [];

  const lower = (node: Expression): void => {
    switch (node.kind) {
      case "literal":
        instructions.push({ op: "constant", value: node.value });
        return;
      case "unary":
        lower(node.operand);
        if (node.operator === "-") instructions.push({ op: "negative" });
        else instructions.push({ op: "positive" });
        return;
      case "binary":
        lower(node.left);
        lower(node.right);
        instructions.push({ op: OPERATION_MAP[node.operator] });
        return;
      default:
        throw new CompilerError("AST_INVALID", "Cannot lower an unknown AST node.", 0);
    }
  };

  lower(root);
  return { version: 1, instructions };
}
