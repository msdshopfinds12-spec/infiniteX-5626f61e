# GET-03 — Compiler Core Usage

The module is available from `src/engine/compiler/index.ts`.

```ts
import { evaluateExpression, formatEvaluation } from "./engine/compiler/index.ts";

const exact = evaluateExpression("(0.1 + 0.2) * 10");
const display = formatEvaluation(
  // Parse and evaluate a restricted arithmetic expression.
  (await import("./engine/compiler/index.ts")).compileExpression("1 / 8"),
  { divisionPrecision: 3 },
);

console.log(display); // "0.125"
console.log(exact);   // DecimalValue: { coefficient: 3n, scale: 0 }
```

## Public API

- `tokenize(source)`: returns source-positioned tokens.
- `parseTokens(tokens)`: parses tokens into a typed AST.
- `compileExpression(source)`: lexes and parses source into an AST.
- `evaluateAst(ast, options)`: evaluates a typed AST using GET-02G decimal functions.
- `evaluateExpression(source, options)`: compiles and evaluates in one call.
- `formatEvaluation(ast, options)`: evaluates and returns a canonical decimal string.

## Division

Default division precision is 18 fractional digits, using half-even rounding. Pass `{ divisionPrecision: 0..1000 }` to override. Division by zero raises the existing typed numeric error.

## Diagnostics

`CompilerError` includes `code` and zero-based `offset`. Arithmetic failures may throw `NumericEngineError` from GET-02G.

## Safety contract

This is a pure arithmetic evaluator. It does not evaluate JavaScript, execute commands, access the network or filesystem, read environment variables, or support identifiers/function calls. Do not add dynamic execution to this module.
