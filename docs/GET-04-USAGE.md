# GET-04 — Semantic and IR API

```ts
import {
  compileExpression,
  analyzeExpression,
  lowerToIR,
  optimizeIR,
  executeIR,
  compileAndRun,
  formatDecimal,
} from "./engine/compiler/index.ts";

const ast = compileExpression("(0.1 + 0.2) * 10");
const report = analyzeExpression(ast);
const ir = lowerToIR(ast);
const optimized = optimizeIR(ir);
const value = executeIR(optimized);

console.log(report);
console.log(formatDecimal(value)); // "3"
```

## End-to-end API

`compileAndRun(source, { divisionPrecision })` returns:
- `ir`: verified unoptimized IR.
- `optimizedIR`: verified optimized IR.
- `astValue`: reference AST evaluator result.
- `irValue`: interpreter result.

Compare the two values in regression tests using `formatDecimal` or normalized DecimalValue fields.

## Trust boundary

IR may be supplied by external callers. Always pass it through `verifyIR`; `executeIR` performs verification itself. Do not deserialize arbitrary IR and execute it without validation. Keep instruction data untrusted even when it was generated internally.
