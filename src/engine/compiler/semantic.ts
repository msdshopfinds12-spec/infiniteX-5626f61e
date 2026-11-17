import { CompilerError } from "./errors.ts";
import type { Expression } from "./ast.ts";

export interface SemanticReport {
  readonly nodeCount: number;
  readonly maxDepth: number;
  readonly literalCount: number;
  readonly operatorCount: number;
}

const MAX_AST_NODES = 4_000;
const MAX_AST_DEPTH = 256;
const OPERATORS = new Set(["+", "-", "*", "/"]);

export function analyzeExpression(root: Expression): SemanticReport {
  let nodeCount = 0;
  let maxDepth = 0;
  let literalCount = 0;
  let operatorCount = 0;

  const visit = (node: Expression, depth: number): void => {
    if (node === null || typeof node !== "object") {
      throw new CompilerError("AST_INVALID", "AST node must be an object.", 0);
    }
    nodeCount += 1;
    maxDepth = Math.max(maxDepth, depth);
    if (nodeCount > MAX_AST_NODES || depth > MAX_AST_DEPTH) {
      throw new CompilerError("AST_LIMIT_EXCEEDED", "AST exceeds configured complexity limits.", node.start);
    }
    if (!Number.isInteger(node.start) || !Number.isInteger(node.end) ||
        node.start < 0 || node.end < node.start) {
      throw new CompilerError("AST_INVALID", "AST source span is invalid.", 0);
    }

    switch (node.kind) {
      case "literal":
        if (typeof node.value !== "string" || !/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(node.value)) {
          throw new CompilerError("AST_INVALID", "AST literal is not a valid decimal string.", node.start);
        }
        literalCount += 1;
        return;
      case "unary":
        if (node.operator !== "+" && node.operator !== "-") {
          throw new CompilerError("AST_INVALID", "Unsupported unary operator.", node.start);
        }
        operatorCount += 1;
        visit(node.operand, depth + 1);
        return;
      case "binary":
        if (!OPERATORS.has(node.operator)) {
          throw new CompilerError("AST_INVALID", "Unsupported binary operator.", node.start);
        }
        operatorCount += 1;
        visit(node.left, depth + 1);
        visit(node.right, depth + 1);
        return;
      default:
        throw new CompilerError("AST_INVALID", "Unknown AST node kind.", 0);
    }
  };

  visit(root, 1);
  return { nodeCount, maxDepth, literalCount, operatorCount };
}
