import test from "node:test";
import assert from "node:assert/strict";
import { createLocalAdapterRuntime, LocalAdapterError } from "../server/integrations/local-adapter-runtime.mjs";

test("text.metrics counts words and mixed newline formats correctly", () => {
  const runtime = createLocalAdapterRuntime();
  const result = runtime.run({
    capability: "text.metrics",
    input: { text: "  Alpha   beta\r\nGamma\nDelta\r " },
  });
  assert.deepEqual(result.output, { characters: 31, words: 4, lines: 4 });
  assert.equal(result.status, "completed");
  assert.equal(result.sideEffects, "none");
});

test("text.metrics handles empty and whitespace-only text", () => {
  const runtime = createLocalAdapterRuntime();
  assert.deepEqual(runtime.run({ capability: "text.metrics", input: { text: "" } }).output,
    { characters: 0, words: 0, lines: 0 });
  assert.deepEqual(runtime.run({ capability: "text.metrics", input: { text: " \t\n " } }).output,
    { characters: 4, words: 0, lines: 1 });
});

test("task.preview trims valid titles and never queues or executes work", () => {
  const runtime = createLocalAdapterRuntime();
  const result = runtime.run({ capability: "task.preview", input: { title: "  Review architecture  " } });
  assert.deepEqual(result.output, {
    title: "Review architecture",
    accepted: true,
    execution: "not_started",
    note: "Preview only. No task was queued or executed.",
  });
  assert.equal(result.sideEffects, "none");
});

test("unknown capabilities fail closed", () => {
  const runtime = createLocalAdapterRuntime();
  assert.throws(
    () => runtime.run({ capability: "shell.execute", input: {} }),
    (error) => error instanceof LocalAdapterError && error.code === "CAPABILITY_NOT_ALLOWED",
  );
});

test("input schema and size limits are enforced", () => {
  const runtime = createLocalAdapterRuntime({ maxInputBytes: 24 });
  assert.throws(
    () => runtime.run({ capability: "text.metrics", input: { text: "x".repeat(100) } }),
    (error) => error.code === "INPUT_TOO_LARGE",
  );
  assert.throws(
    () => runtime.run({ capability: "text.metrics", input: { text: 42 } }),
    (error) => error.code === "INVALID_ARGUMENT",
  );
  assert.throws(
    () => runtime.run({ capability: "text.metrics", input: [] }),
    (error) => error.code === "INVALID_INPUT",
  );
});

test("unsafe prototype keys and non-JSON objects are rejected", () => {
  const runtime = createLocalAdapterRuntime();
  const unsafe = JSON.parse('{"__proto__":{"polluted":true}}');
  assert.throws(
    () => runtime.run({ capability: "text.metrics", input: unsafe }),
    (error) => error.code === "UNSAFE_KEY",
  );
  assert.throws(
    () => runtime.run({ capability: "text.metrics", input: { text: new Date() } }),
    (error) => error.code === "INVALID_INPUT",
  );
});

test("nesting depth and non-finite numeric values are rejected", () => {
  const runtime = createLocalAdapterRuntime();
  let nested = {};
  let cursor = nested;
  for (let index = 0; index < 10; index += 1) {
    cursor.child = {};
    cursor = cursor.child;
  }
  assert.throws(
    () => runtime.run({ capability: "text.metrics", input: { text: "ok", nested } }),
    (error) => error.code === "INPUT_TOO_DEEP",
  );
  assert.throws(
    () => runtime.run({ capability: "text.metrics", input: { text: "ok", number: Infinity } }),
    (error) => error.code === "INVALID_INPUT",
  );
});

test("task preview validates title bounds", () => {
  const runtime = createLocalAdapterRuntime();
  for (const title of ["", "   ", "x".repeat(161)]) {
    assert.throws(
      () => runtime.run({ capability: "task.preview", input: { title } }),
      (error) => error.code === "INVALID_ARGUMENT",
    );
  }
});

test("pre-aborted operations are rejected before dispatch", () => {
  const runtime = createLocalAdapterRuntime();
  const controller = new AbortController();
  controller.abort();
  assert.throws(
    () => runtime.run({ capability: "text.metrics", input: { text: "safe" }, signal: controller.signal }),
    (error) => error.code === "ABORTED",
  );
});

test("output size and clock invariants are enforced", () => {
  const smallOutput = createLocalAdapterRuntime({ maxOutputBytes: 8 });
  assert.throws(
    () => smallOutput.run({ capability: "text.metrics", input: { text: "a" } }),
    (error) => error.code === "OUTPUT_TOO_LARGE",
  );

  const invalidClock = createLocalAdapterRuntime({ now: () => Number.NaN });
  assert.throws(
    () => invalidClock.run({ capability: "text.metrics", input: { text: "a" } }),
    (error) => error.code === "INVALID_CLOCK",
  );

  let tick = 10;
  const backwardsClock = createLocalAdapterRuntime({ now: () => tick-- });
  assert.throws(
    () => backwardsClock.run({ capability: "text.metrics", input: { text: "a" } }),
    (error) => error.code === "INVALID_CLOCK",
  );
});

test("runtime configuration is bounded and its capability catalog is immutable", () => {
  assert.throws(() => createLocalAdapterRuntime({ maxInputBytes: 0 }), TypeError);
  assert.throws(() => createLocalAdapterRuntime({ maxOutputBytes: 100_000 }), TypeError);
  const runtime = createLocalAdapterRuntime();
  const capabilities = runtime.listCapabilities();
  assert.equal(capabilities.length, 2);
  assert.equal(capabilities.every((item) => item.enabled), true);
  assert.equal(Object.isFrozen(capabilities), true);
  assert.equal(Object.isFrozen(capabilities[0]), true);
});
