import test, { before } from "node:test";
import assert from "node:assert/strict";
import { build } from "vite";

let numeric;

before(async () => {
  const result = await build({
    configFile: false,
    logLevel: "silent",
    build: {
      lib: {
        entry: "src/engine/numeric/index.ts",
        formats: ["es"],
        fileName: "numeric-engine",
      },
      write: false,
      minify: false,
    },
  });
  const output = result.output.find((item) => item.type === "chunk");
  assert.ok(output, "Vite should produce a numeric engine bundle");
  numeric = await import(`data:text/javascript;base64,${Buffer.from(output.code).toString("base64")}`);
});

test("exact decimal addition avoids binary floating-point error", () => {
  assert.equal(numeric.formatDecimal(numeric.addDecimal(numeric.parseDecimal("0.1"), numeric.parseDecimal("0.2"))), "0.3");
});

test("decimal subtraction and multiplication remain exact", () => {
  assert.equal(numeric.formatDecimal(numeric.subtractDecimal(numeric.parseDecimal("5.5"), numeric.parseDecimal("2.25"))), "3.25");
  assert.equal(numeric.formatDecimal(numeric.multiplyDecimal(numeric.parseDecimal("1.25"), numeric.parseDecimal("2"))), "2.5");
});

test("decimal comparison accounts for scale differences", () => {
  assert.equal(numeric.compareDecimal(numeric.parseDecimal("2.50"), numeric.parseDecimal("2.5")), 0);
  assert.equal(numeric.compareDecimal(numeric.parseDecimal("-2.51"), numeric.parseDecimal("-2.5")), -1);
});

test("decimal formatting normalizes zero and trailing zeros", () => {
  assert.equal(numeric.formatDecimal(numeric.parseDecimal("-0.000")), "0");
  assert.equal(numeric.formatDecimal(numeric.parseDecimal("120.5000")), "120.5");
});

test("division supports requested precision", () => {
  assert.equal(numeric.formatDecimal(numeric.divideDecimal(numeric.parseDecimal("1"), numeric.parseDecimal("8"), 3)), "0.125");
});

test("half-even and half-up rounding differ correctly on ties", () => {
  assert.equal(numeric.formatDecimal(numeric.divideDecimal(numeric.parseDecimal("1"), numeric.parseDecimal("8"), 2, "half-even")), "0.12");
  assert.equal(numeric.formatDecimal(numeric.divideDecimal(numeric.parseDecimal("1"), numeric.parseDecimal("8"), 2, "half-up")), "0.13");
});

test("negative floor, ceil, and down use documented directions", () => {
  const minusOneThird = numeric.parseDecimal("-1");
  const three = numeric.parseDecimal("3");
  assert.equal(numeric.formatDecimal(numeric.divideDecimal(minusOneThird, three, 0, "floor")), "-1");
  assert.equal(numeric.formatDecimal(numeric.divideDecimal(minusOneThird, three, 0, "ceil")), "0");
  assert.equal(numeric.formatDecimal(numeric.divideDecimal(minusOneThird, three, 0, "down")), "0");
});

test("division by zero returns a typed engine error", () => {
  assert.throws(() => numeric.divideDecimal(numeric.parseDecimal("1"), numeric.parseDecimal("0")), (error) => error.code === "DIVISION_BY_ZERO");
});

test("unsupported runtime rounding modes are rejected", () => {
  assert.throws(() => numeric.divideDecimal(numeric.parseDecimal("1"), numeric.parseDecimal("3"), 2, "unknown"), (error) => error.code === "INVALID_ROUNDING_MODE");
});

test("invalid division precision is rejected", () => {
  assert.throws(() => numeric.divideDecimal(numeric.parseDecimal("1"), numeric.parseDecimal("3"), -1), (error) => error.code === "PRECISION_OUT_OF_RANGE");
  assert.throws(() => numeric.divideDecimal(numeric.parseDecimal("1"), numeric.parseDecimal("3"), 1001), (error) => error.code === "PRECISION_OUT_OF_RANGE");
});

test("unsafe integer conversion is rejected while BigInt remains exact", () => {
  assert.equal(numeric.parseSafeInteger("9007199254740991"), Number.MAX_SAFE_INTEGER);
  assert.throws(() => numeric.parseSafeInteger("9007199254740992"), (error) => error.code === "UNSAFE_INTEGER");
  assert.equal(numeric.parseIntegerLiteral("9007199254740992"), 9007199254740992n);
});

test("large integers round-trip without precision loss", () => {
  const literal = "1234567890123456789012345678901234567890";
  assert.equal(numeric.serializeBigInt(numeric.parseIntegerLiteral(literal)), literal);
});

test("integer parser rejects malformed syntax", () => {
  for (const input of ["", "01", "+1", "1.0", "1e3", " 1", "1 "]) {
    assert.throws(() => numeric.parseIntegerLiteral(input));
  }
});

test("decimal parser rejects malformed syntax", () => {
  for (const input of ["", "01.2", "+1.2", ".5", "1.", "1e3", "1,000", " 1.2"]) {
    assert.throws(() => numeric.parseDecimal(input));
  }
});

test("public parsers reject non-string runtime inputs", () => {
  assert.throws(() => numeric.parseDecimal(12), (error) => error.code === "INVALID_DECIMAL");
  assert.throws(() => numeric.parseIntegerLiteral(12), (error) => error.code === "INVALID_INTEGER");
});

test("excessive literal size and decimal scale are rejected", () => {
  assert.throws(() => numeric.parseIntegerLiteral("1".repeat(10_001)), (error) => error.code === "INPUT_TOO_LONG");
  assert.throws(() => numeric.parseDecimal("0." + "1".repeat(1_001)), (error) => error.code === "PRECISION_OUT_OF_RANGE");
});

test("exact numeric JSON serialization uses strings", () => {
  const value = numeric.parseDecimal("9007199254740993.125");
  assert.equal(numeric.decimalToJSON(value), "9007199254740993.125");
  assert.equal(numeric.parseExactIntegerJSON("9007199254740993"), 9007199254740993n);
  assert.throws(() => numeric.parseExactIntegerJSON(9007199254740993));
});

test("negative decimal arithmetic preserves sign", () => {
  assert.equal(numeric.formatDecimal(numeric.addDecimal(numeric.parseDecimal("-0.1"), numeric.parseDecimal("0.2"))), "0.1");
  assert.equal(numeric.formatDecimal(numeric.multiplyDecimal(numeric.parseDecimal("-1.5"), numeric.parseDecimal("2"))), "-3");
});

test("resource limits reject excessive multiplication scale", () => {
  const highScale = numeric.parseDecimal("0." + "1".repeat(1000));
  assert.throws(() => numeric.multiplyDecimal(highScale, highScale), (error) => error.code === "PRECISION_OUT_OF_RANGE");
});
