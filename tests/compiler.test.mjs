import test, { before } from "node:test";
import assert from "node:assert/strict";
import { build } from "vite";

let compiler;

before(async () => {
  const result = await build({
    configFile: false,
    logLevel: "silent",
    build: {
      lib: { entry: "src/engine/compiler/index.ts", formats: ["es"], fileName: "compiler" },
      write: false,
      minify: false,
    },
  });
  const outputs = Array.isArray(result) ? result : [result];
  const output = outputs.flatMap((item) => item.output ?? []).find((item) => item.type === "chunk");
  assert.ok(output, "Vite should bundle the compiler module");
  compiler = await import(`data:text/javascript;base64,${Buffer.from(output.code).toString("base64")}`);
});

test("lexer emits source-positioned numeric and operator tokens", () => {
  const tokens = compiler.tokenize("12.5 + (3 * 4)");
  assert.deepEqual(tokens.map((token) => token.kind), [
    "number", "plus", "left-paren", "number", "star", "number", "right-paren", "eof",
  ]);
  assert.equal(tokens[0].start, 0);
  assert.equal(tokens[0].end, 4);
});

test("lexer ignores whitespace and emits EOF", () => {
  const tokens = compiler.tokenize("  2\n + 3 ");
  assert.equal(tokens.at(-1).kind, "eof");
  assert.equal(tokens.at(-1).start, 9);
});

test("lexer rejects unknown characters", () => {
  assert.throws(() => compiler.tokenize("1 $ 2"), (error) =>
    error.code === "UNEXPECTED_CHARACTER" && error.offset === 2);
});

test("lexer rejects leading zeros and malformed decimal points", () => {
  for (const source of ["01", "1.", ".5", "1e3", "2..1"]) {
    assert.throws(() => compiler.tokenize(source), (error) =>
      ["INVALID_NUMBER", "UNEXPECTED_CHARACTER"].includes(error.code));
  }
});

test("lexer enforces source length and token count limits", () => {
  assert.throws(() => compiler.tokenize(" ".repeat(10_001)), (error) => error.code === "SOURCE_TOO_LONG");
  assert.throws(() => compiler.tokenize("1+".repeat(1_001) + "1"), (error) => error.code === "TOO_MANY_TOKENS");
});

test("parser applies multiplication precedence over addition", () => {
  assert.equal(compiler.formatEvaluation(compiler.compileExpression("2 + 3 * 4")), "14");
});

test("parser preserves left associativity", () => {
  assert.equal(compiler.formatEvaluation(compiler.compileExpression("20 / 5 / 2")), "2");
  assert.equal(compiler.formatEvaluation(compiler.compileExpression("10 - 3 - 2")), "5");
});

test("parentheses override precedence", () => {
  assert.equal(compiler.formatEvaluation(compiler.compileExpression("(2 + 3) * 4")), "20");
});

test("unary plus and minus are supported", () => {
  assert.equal(compiler.formatEvaluation(compiler.compileExpression("-2 + +3")), "1");
  assert.equal(compiler.formatEvaluation(compiler.compileExpression("--2")), "2");
});

test("nested groups evaluate correctly", () => {
  assert.equal(compiler.formatEvaluation(compiler.compileExpression("(((7)))")), "7");
});

test("parser reports missing operands and closing parentheses", () => {
  assert.throws(() => compiler.compileExpression("1 +"), (error) => error.code === "EXPECTED_EXPRESSION");
  assert.throws(() => compiler.compileExpression("(1 + 2"), (error) => error.code === "EXPECTED_CLOSING_PAREN");
});

test("parser rejects trailing tokens and implicit multiplication", () => {
  assert.throws(() => compiler.compileExpression("1 2"), (error) => error.code === "TRAILING_TOKEN");
  assert.throws(() => compiler.compileExpression("2(3)"), (error) => error.code === "TRAILING_TOKEN");
});

test("parser enforces maximum nesting depth", () => {
  assert.throws(() => compiler.compileExpression("(".repeat(129) + "1" + ")".repeat(129)),
    (error) => error.code === "NESTING_LIMIT_EXCEEDED");
});

test("exact decimal addition avoids binary floating-point error", () => {
  assert.equal(compiler.formatEvaluation(compiler.compileExpression("0.1 + 0.2")), "0.3");
});

test("exact subtraction and multiplication work", () => {
  assert.equal(compiler.formatEvaluation(compiler.compileExpression("5.5 - 2.25")), "3.25");
  assert.equal(compiler.formatEvaluation(compiler.compileExpression("1.25 * 2")), "2.5");
});

test("division uses configured precision and half-even rounding", () => {
  assert.equal(compiler.formatEvaluation(compiler.compileExpression("1 / 8"), { divisionPrecision: 3 }), "0.125");
  assert.equal(compiler.formatEvaluation(compiler.compileExpression("1 / 8"), { divisionPrecision: 2 }), "0.12");
});

test("division by zero propagates a typed numeric error", () => {
  assert.throws(() => compiler.evaluateExpression("9 / (3 - 3)"),
    (error) => error.code === "DIVISION_BY_ZERO");
});

test("invalid division precision is rejected", () => {
  for (const divisionPrecision of [-1, 1.5, 1_001]) {
    assert.throws(() => compiler.evaluateExpression("1 / 3", { divisionPrecision }),
      (error) => error.code === "INVALID_DIVISION_PRECISION");
  }
});

test("negative arithmetic remains exact", () => {
  assert.equal(compiler.formatEvaluation(compiler.compileExpression("-0.1 + 0.2")), "0.1");
  assert.equal(compiler.formatEvaluation(compiler.compileExpression("-1.5 * 2")), "-3");
});

test("compiler accepts only the documented arithmetic language", () => {
  for (const source of ["name", "1 ** 2", "1 % 2", "1; alert(1)", "import x"]) {
    assert.throws(() => compiler.compileExpression(source));
  }
});

test("empty input is rejected with a positioned compiler error", () => {
  assert.throws(() => compiler.compileExpression("   "), (error) =>
    error.code === "EXPECTED_EXPRESSION" && error.offset === 3);
});
