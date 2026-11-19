import test from "node:test";
import assert from "node:assert/strict";
import { executeSafeAction, record } from "./workflow-actions.mjs";

test("normalizes only object records without mutating inputs", () => {
  assert.deepEqual(record({ a: 1 }), { a: 1 });
  assert.deepEqual(record("x"), { value: "x" });
  assert.deepEqual(record(null), { value: null });
  const input = { a: 1 };
  executeSafeAction("set_value", input, { key: "b", value: 2 });
  assert.deepEqual(input, { a: 1 });
});

test("supports the allowlisted deterministic JSON actions", () => {
  assert.deepEqual(executeSafeAction("pass_through", { a: 1 }, {}), { a: 1 });
  assert.deepEqual(executeSafeAction("set_value", { a: 1 }, { key: "b", value: 2 }), { a: 1, b: 2 });
  assert.deepEqual(executeSafeAction("merge_json", { a: 1 }, { value: { b: 2 } }), { a: 1, b: 2 });
  assert.deepEqual(executeSafeAction("uppercase_text", { text: "hello" }, {}), { text: "HELLO" });
  assert.deepEqual(executeSafeAction("lowercase_text", { text: "HELLO" }, {}), { text: "hello" });
  assert.deepEqual(executeSafeAction("append_text", { text: "hello" }, { text: "!" }), { text: "hello!" });
  assert.deepEqual(executeSafeAction("prepend_text", { text: "world" }, { text: "hello " }), { text: "hello world" });
});

test("rejects unknown actions and invalid configuration", () => {
  assert.throws(() => executeSafeAction("run_javascript", {}, {}), /unsupported_action_type/);
  assert.throws(() => executeSafeAction("set_value", {}, { key: "x" }), /config.value_required/);
  assert.throws(() => executeSafeAction("set_value", {}, { key: " " , value: 1 }), /config.key_must_be_non_empty_string/);
  assert.throws(() => executeSafeAction("merge_json", {}, { value: [] }), /config.value_must_be_json_object/);
  assert.throws(() => executeSafeAction("merge_json", {}, { value: null }), /config.value_must_be_json_object/);
  assert.throws(() => executeSafeAction("append_text", { text: 1 }, { text: "!" }), /input_text_field_required/);
  assert.throws(() => executeSafeAction("prepend_text", { text: "x" }, { text: "" }), /config.text_must_be_non_empty_string/);
});

test("supports explicit text-field selection", () => {
  assert.deepEqual(
    executeSafeAction("uppercase_text", { message: "hi", text: "unchanged" }, { key: "message" }),
    { message: "HI", text: "unchanged" },
  );
});
