import test, { before } from "node:test";
import assert from "node:assert/strict";
import { build } from "vite";

let api;
before(async () => {
  const result = await build({
    configFile: false,
    logLevel: "silent",
    build: {
      lib: { entry: "src/engine/compiler/index.ts", formats: ["es"], fileName: "compiler-ir" },
      write: false,
      minify: false,
    },
  });
  const outputs = Array.isArray(result) ? result : [result];
  const chunk = outputs.flatMap((item) => item.output ?? []).find((item) => item.type === "chunk");
  assert.ok(chunk, "Vite should bundle the IR pipeline");
  api = await import(`data:text/javascript;base64,${Buffer.from(chunk.code).toString("base64")}`);
});

test("semantic analysis reports node and operator counts", () => {
  const ast = api.parseTokens(api.tokenize("2 + 3 * 4"));
  assert.deepEqual(api.analyzeExpression(ast), {
    nodeCount: 5, maxDepth: 3, literalCount: 3, operatorCount: 2,
  });
});

test("semantic analysis rejects malformed AST nodes", () => {
  assert.throws(() => api.analyzeExpression({ kind: "call", start: 0, end: 1 }),
    (error) => error.code === "AST_INVALID");
  assert.throws(() => api.analyzeExpression({ kind: "literal", value: "01", start: 0, end: 2 }),
    (error) => error.code === "AST_INVALID");
});

test("lowering produces deterministic postfix IR", () => {
  const ast = api.parseTokens(api.tokenize("2 + 3 * 4"));
  const ir = api.lowerToIR(ast);
  assert.deepEqual(ir.instructions.map((item) => item.op),
    ["constant", "constant", "constant", "multiply", "add"]);
  assert.doesNotThrow(() => api.verifyIR(ir));
});

test("IR verifier rejects underflow, unknown operations, and invalid final stack", () => {
  for (const instructions of [
    [{ op: "add" }],
    [{ op: "constant", value: "1" }, { op: "constant", value: "2" }],
    [{ op: "mystery" }],
    [{ op: "constant", value: "01" }],
  ]) {
    assert.throws(() => api.verifyIR({ version: 1, instructions }),
      (error) => error.code === "IR_INVALID");
  }
});

test("IR verifier rejects oversized instruction streams", () => {
  assert.throws(() => api.verifyIR({
    version: 1,
    instructions: Array.from({ length: 8_001 }, () => ({ op: "constant", value: "1" })),
  }), (error) => error.code === "IR_LIMIT_EXCEEDED");
});

test("runtime executes IR with exact decimal arithmetic", () => {
  const result = api.compileAndRun("0.1 + 0.2");
  assert.equal(api.formatDecimal(result.irValue), "0.3");
  assert.equal(api.formatDecimal(result.astValue), "0.3");
});

test("optimizer folds constant expressions without changing results", () => {
  const result = api.compileAndRun("(2 + 3) * (4 - 1)");
  assert.equal(api.formatDecimal(result.astValue), "15");
  assert.equal(api.formatDecimal(result.irValue), "15");
  assert.deepEqual(result.optimizedIR.instructions, [{ op: "constant", value: "15" }]);
});

test("optimizer preserves configurable division precision", () => {
  const result = api.compileAndRun("1 / 3", { divisionPrecision: 2 });
  assert.equal(api.formatDecimal(result.astValue), "0.33");
  assert.equal(api.formatDecimal(result.irValue), "0.33");
});

test("optimizer does not fold expressions with non-constant operands", () => {
  const ast = api.compileExpression("1 + (2 / 3)");
  const ir = api.lowerToIR(ast);
  const optimized = api.optimizeIR(ir);
  assert.ok(optimized.instructions.length <= ir.instructions.length);
  assert.equal(api.formatDecimal(api.executeIR(optimized)), "1.666666666666666667");
});

test("division by zero remains a typed arithmetic error", () => {
  assert.throws(() => api.compileAndRun("10 / (5 - 5)"),
    (error) => error.code === "DIVISION_BY_ZERO");
});

test("IR runtime rejects invalid division precision", () => {
  const ir = api.lowerToIR(api.compileExpression("1 / 2"));
  assert.throws(() => api.executeIR(ir, { divisionPrecision: 1_001 }),
    (error) => error.code === "INVALID_DIVISION_PRECISION");
});

test("pipeline output is deterministic for identical source and options", () => {
  const first = api.compileAndRun("((7 + 5) * 2) / 3", { divisionPrecision: 4 });
  const second = api.compileAndRun("((7 + 5) * 2) / 3", { divisionPrecision: 4 });
  assert.deepEqual(first, second);
});
