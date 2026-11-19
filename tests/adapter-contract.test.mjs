import test from "node:test";
import assert from "node:assert/strict";
import { createAdapterRegistry, AdapterContractError } from "../server/integrations/adapter-contract.mjs";

const descriptor = {
  id: "iq-core-reference",
  version: "0.1.0",
  sourceRepository: "https://github.com/msdshopfinds12-spec/msdshopfinds12-spec-infiniteGX.7-IQ-Core",
  sourceCommit: "0123456789abcdef0123456789abcdef01234567",
  licenseVerified: false,
  ownerReuseApproved: false,
  runtime: "python-worker",
  capabilities: ["compute:local", "read:agent-catalog"],
  networkPolicy: "none",
  maxEstimatedCostUsd: 0,
  status: "review-required",
};

test("registers metadata-only adapter in disabled state", () => {
  const registry = createAdapterRegistry([descriptor]);
  const adapter = registry.get("iq-core-reference");
  assert.equal(adapter.status, "disabled");
  assert.equal(adapter.networkPolicy, "none");
  assert.equal(adapter.maxEstimatedCostUsd, 0);
  assert.equal(Object.isFrozen(adapter), true);
  assert.equal(Object.isFrozen(adapter.capabilities), true);
});

test("rejects duplicate adapter identifiers", () => {
  assert.throws(
    () => createAdapterRegistry([descriptor, descriptor]),
    (error) => error instanceof AdapterContractError && error.code === "DUPLICATE_ADAPTER",
  );
});

test("fails closed when source provenance is incomplete", () => {
  assert.throws(
    () => createAdapterRegistry([{ ...descriptor, sourceCommit: "main" }]),
    (error) => error.code === "INVALID_PROVENANCE",
  );
});

test("rejects unknown or privileged capabilities", () => {
  assert.throws(
    () => createAdapterRegistry([{ ...descriptor, capabilities: ["shell:execute"] }]),
    (error) => error.code === "INVALID_CAPABILITY",
  );
});

test("rejects network access and non-zero budgets", () => {
  assert.throws(
    () => createAdapterRegistry([{ ...descriptor, networkPolicy: "allowlist" }]),
    (error) => error.code === "NETWORK_NOT_ALLOWED",
  );
  assert.throws(
    () => createAdapterRegistry([{ ...descriptor, maxEstimatedCostUsd: 0.01 }]),
    (error) => error.code === "NONZERO_BUDGET",
  );
});

test("requires license and owner reuse gates to be explicit", () => {
  const { licenseVerified, ...missing } = descriptor;
  assert.throws(
    () => createAdapterRegistry([missing]),
    (error) => error.code === "MISSING_REUSE_GATES",
  );
});

test("keeps adapter disabled even after metadata gates are marked true", () => {
  const registry = createAdapterRegistry([{
    ...descriptor,
    licenseVerified: true,
    ownerReuseApproved: true,
    status: "disabled",
  }]);
  assert.equal(registry.get("iq-core-reference").status, "disabled");
});

import { createLocalAdapterRuntime, LocalAdapterError } from "../server/integrations/local-adapter-runtime.mjs";

test("local text metrics count words and mixed newline formats correctly", () => {
  const runtime = createLocalAdapterRuntime();
  const result = runtime.run({ capability: "text.metrics", input: { text: "  Alpha   beta\r\nGamma\nDelta\r " } });
  assert.deepEqual(result.output, { characters: 29, words: 4, lines: 4 });
  assert.equal(result.sideEffects, "none");
});

test("local text metrics handle empty and whitespace-only text", () => {
  const runtime = createLocalAdapterRuntime();
  assert.deepEqual(runtime.run({ capability: "text.metrics", input: { text: "" } }).output,
    { characters: 0, words: 0, lines: 0 });
  assert.deepEqual(runtime.run({ capability: "text.metrics", input: { text: " \t\n " } }).output,
    { characters: 4, words: 0, lines: 2 });
});

test("task preview is non-executing and validates title bounds", () => {
  const runtime = createLocalAdapterRuntime();
  const result = runtime.run({ capability: "task.preview", input: { title: "  Review architecture  " } });
  assert.equal(result.output.title, "Review architecture");
  assert.equal(result.output.execution, "not_started");
  assert.equal(result.sideEffects, "none");
  for (const title of ["", "   ", "x".repeat(161)]) {
    assert.throws(() => runtime.run({ capability: "task.preview", input: { title } }),
      (error) => error.code === "INVALID_ARGUMENT");
  }
});

test("local runtime rejects unknown capabilities, malformed inputs, and unsafe keys", () => {
  const runtime = createLocalAdapterRuntime();
  assert.throws(() => runtime.run({ capability: "shell.execute", input: {} }),
    (error) => error instanceof LocalAdapterError && error.code === "CAPABILITY_NOT_ALLOWED");
  assert.throws(() => runtime.run({ capability: "text.metrics", input: [] }),
    (error) => error.code === "INVALID_INPUT");
  assert.throws(() => runtime.run({ capability: "text.metrics", input: { text: 42 } }),
    (error) => error.code === "INVALID_ARGUMENT");
  assert.throws(() => runtime.run({ capability: "text.metrics", input: JSON.parse('{"__proto__":{"polluted":true}}') }),
    (error) => error.code === "UNSAFE_KEY");
  assert.throws(() => runtime.run({ capability: "text.metrics", input: { text: new Date() } }),
    (error) => error.code === "INVALID_INPUT");
});

test("local runtime enforces nesting, byte-size, and finite-number limits", () => {
  const small = createLocalAdapterRuntime({ maxInputBytes: 24 });
  assert.throws(() => small.run({ capability: "text.metrics", input: { text: "x".repeat(100) } }),
    (error) => error.code === "INPUT_TOO_LARGE");
  assert.throws(() => createLocalAdapterRuntime({ maxInputBytes: 0 }), TypeError);
  assert.throws(() => createLocalAdapterRuntime({ maxOutputBytes: 100_000 }), TypeError);
  const runtime = createLocalAdapterRuntime();
  let nested = {};
  let cursor = nested;
  for (let index = 0; index < 10; index += 1) { cursor.child = {}; cursor = cursor.child; }
  assert.throws(() => runtime.run({ capability: "text.metrics", input: { text: "ok", nested } }),
    (error) => error.code === "INPUT_TOO_DEEP");
  assert.throws(() => runtime.run({ capability: "text.metrics", input: { text: "ok", number: Infinity } }),
    (error) => error.code === "INVALID_INPUT");
});

test("local runtime rejects pre-aborted requests and oversized output", () => {
  const runtime = createLocalAdapterRuntime();
  const controller = new AbortController();
  controller.abort();
  assert.throws(() => runtime.run({ capability: "text.metrics", input: { text: "safe" }, signal: controller.signal }),
    (error) => error.code === "ABORTED");
  const smallOutput = createLocalAdapterRuntime({ maxOutputBytes: 8 });
  assert.throws(() => smallOutput.run({ capability: "text.metrics", input: { text: "a" } }),
    (error) => error.code === "OUTPUT_TOO_LARGE");
});

test("local runtime rejects invalid or non-monotonic clocks", () => {
  const invalid = createLocalAdapterRuntime({ now: () => Number.NaN });
  assert.throws(() => invalid.run({ capability: "text.metrics", input: { text: "a" } }),
    (error) => error.code === "INVALID_CLOCK");
  let tick = 10;
  const backwards = createLocalAdapterRuntime({ now: () => tick-- });
  assert.throws(() => backwards.run({ capability: "text.metrics", input: { text: "a" } }),
    (error) => error.code === "INVALID_CLOCK");
});
