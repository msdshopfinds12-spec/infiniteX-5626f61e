import { tokenize } from "./lexer.ts";
import { parseTokens } from "./parser.ts";
import { evaluateAst, type EvaluationOptions } from "./evaluator.ts";
import { lowerToIR } from "./lower.ts";
import { optimizeIR } from "./optimizer.ts";
import { executeIR } from "./runtime.ts";
import type { IntermediateRepresentation } from "./ir.ts";
import type { DecimalValue } from "../numeric/decimal.ts";

export interface CompilationResult {
  readonly ir: IntermediateRepresentation;
  readonly optimizedIR: IntermediateRepresentation;
  readonly astValue: DecimalValue;
  readonly irValue: DecimalValue;
}

export function compileAndRun(source: string, options: EvaluationOptions = {}): CompilationResult {
  const ast = compileExpression(source);
  const ir = lowerToIR(ast);
  const optimizedIR = optimizeIR(ir);
  const astValue = evaluateAst(ast, options);
  const irValue = executeIR(optimizedIR, options);
  return { ir, optimizedIR, astValue, irValue };
}
