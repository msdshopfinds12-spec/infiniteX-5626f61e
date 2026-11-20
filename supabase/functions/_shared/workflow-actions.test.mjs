import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  executeSafeAction,
  normalizeRecord,
  toSafeActionError,
  WorkflowActionError,
} from "./workflow-actions.mjs";

test("normalizes records without mutating the supplied input", () => {
  const input = { nested: { stable: true }, count: 2 };
  const result = normalizeRecord(input);
  assert.deepEqual(result, input);
  assert.notEqual(result, input);
  assert.deepEqual(normalizeRecord(null), { value: null });
  assert.deepEqual(normalizeRecord(["a"]), { value: ["a"] });
  assert.deepEqual(normalizeRecord("text"), { value: "text" });
});

test("executes pass_through and set_value", () => {
  const input = { keep: true };
  assert.deepEqual(executeSafeAction("pass_through", input), input);
  assert.deepEqual(executeSafeAction("set_value", input, { key: "added", value: 7 }), {
    keep: true, added: 7,
  });
  assert.deepEqual(input, { keep: true });
});

test("executes merge_json with own properties, including unusual keys", () => {
  const value = JSON.parse('{"__proto__":{"polluted":true},"constructor":"safe"}');
  const result = executeSafeAction("merge_json", { original: true }, { value });
  assert.equal(Object.hasOwn(result, "__proto__"), true);
  assert.deepEqual(result.__proto__, { polluted: true });
  assert.equal(Object.hasOwn(result, "constructor"), true);
  assert.equal({}.polluted, undefined);
});

test("executes all text transformations", () => {
  assert.deepEqual(executeSafeAction("uppercase_text", { text: "Abc" }), { text: "ABC" });
  assert.deepEqual(executeSafeAction("lowercase_text", { text: "AbC" }), { text: "abc" });
  assert.deepEqual(executeSafeAction("append_text", { text: "A" }, { text: "B" }), { text: "AB" });
  assert.deepEqual(executeSafeAction("prepend_text", { text: "B" }, { text: "A" }), { text: "AB" });
});

test("rejects unsupported actions and malformed configuration with stable codes", () => {
  assert.throws(
    () => executeSafeAction("run_javascript", {}),
    (error) => error instanceof WorkflowActionError && error.code === "unsupported_action_type",
  );
  assert.throws(() => executeSafeAction("set_value", {}, { key: "x" }), /config_value_required/);
  assert.throws(() => executeSafeAction("set_value", {}, { key: " " , value: 1 }), /config_key_invalid/);
  assert.throws(() => executeSafeAction("merge_json", {}, { value: [] }), /config_value_must_be_json_object/);
  assert.throws(() => executeSafeAction("append_text", { text: "a" }, { text: "" }), /config_text_invalid/);
  assert.throws(() => executeSafeAction("uppercase_text", {}), /input_text_field_required/);
});

test("handles text fields named __proto__ without reading inherited properties", () => {
  assert.throws(
    () => executeSafeAction("uppercase_text", {}),
    /input_text_field_required/,
  );
  const input = JSON.parse('{"__proto__":"safe"}');
  assert.deepEqual(
    executeSafeAction("uppercase_text", input, { key: "__proto__" }),
    JSON.parse('{"__proto__":"SAFE"}'),
  );
});

test("normalizes thrown values to bounded non-sensitive error codes", () => {
  assert.equal(toSafeActionError(new WorkflowActionError("config_value_required")), "config_value_required");
  assert.equal(toSafeActionError(new Error("secret token: abc")), "action_failed");
  assert.equal(toSafeActionError("untrusted"), "action_failed");
  assert.ok(toSafeActionError(new Error("x".repeat(10000))).length <= 64);
});

test("both workers import the same shared domain and contain no local executor copy", async () => {
  const workerPaths = [
    new URL("../simula-workflow-worker/index.ts", import.meta.url),
    new URL("../simula-workflow-cron-worker/index.ts", import.meta.url),
  ];
  for (const path of workerPaths) {
    const source = await readFile(path, "utf8");
    assert.match(source, /from ["']\.\.\/_shared\/workflow-actions\.mjs["']/);
    assert.doesNotMatch(source, /function executeSafeAction\s*\(/);
    assert.match(source, /executeSafeAction\(/);
  }
});
