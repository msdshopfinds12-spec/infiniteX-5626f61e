import test from "node:test";
import assert from "node:assert/strict";
import { executeSafeAction, resolveWorkflowOutboxEvent } from "./workflow-actions.mjs";

test("pass_through returns a shallow copy of object input", () => {
  const input = { value: 1 };
  const output = executeSafeAction("pass_through", input, {});
  assert.deepEqual(output, input);
  assert.notEqual(output, input);
});

test("set_value adds or replaces one property", () => {
  assert.deepEqual(executeSafeAction("set_value", { a: 1 }, { key: "b", value: 2 }), { a: 1, b: 2 });
  assert.deepEqual(executeSafeAction("set_value", { a: 1 }, { key: "a", value: 3 }), { a: 3 });
});

test("merge_json merges only plain object-shaped config values", () => {
  assert.deepEqual(executeSafeAction("merge_json", { a: 1 }, { value: { b: 2 } }), { a: 1, b: 2 });
  for (const value of [null, [], "text", 1]) {
    assert.throws(() => executeSafeAction("merge_json", {}, { value }), /config.value_must_be_json_object/);
  }
});

test("text transformations preserve other fields", () => {
  const input = { text: "Hello", keep: true };
  assert.deepEqual(executeSafeAction("uppercase_text", input, {}), { text: "HELLO", keep: true });
  assert.deepEqual(executeSafeAction("lowercase_text", input, {}), { text: "hello", keep: true });
  assert.deepEqual(executeSafeAction("append_text", input, { text: " world" }), { text: "Hello world", keep: true });
  assert.deepEqual(executeSafeAction("prepend_text", input, { text: "Say " }), { text: "Say Hello", keep: true });
});

test("rejects malformed action config and unsupported action types", () => {
  assert.throws(() => executeSafeAction("set_value", {}, { key: "", value: 1 }), /config.key_must_be_non_empty_string/);
  assert.throws(() => executeSafeAction("set_value", {}, { key: "x" }), /config.value_required/);
  assert.throws(() => executeSafeAction("append_text", { text: "a" }, { text: "" }), /config.text_must_be_non_empty_string/);
  assert.throws(() => executeSafeAction("uppercase_text", { text: 1 }, {}), /input_text_field_required:text/);
  assert.throws(() => executeSafeAction("delete_everything", {}, {}), /unsupported_action_type/);
});


test("notification intent action emits only a closed, bounded event descriptor", () => {
  const config = {
    recipient_ref: "81000000-4000-4000-8000-000000000001",
    template_key: "welcome-v1",
  };
  assert.deepEqual(executeSafeAction("emit_notification_intent", { source: "test" }, config), { source: "test" });
  assert.deepEqual(resolveWorkflowOutboxEvent("emit_notification_intent", config), {
    eventType: "notification.requested",
    payload: {
      recipient_ref: "81000000-4000-4000-8000-000000000001",
      template_key: "welcome-v1",
    },
  });
  assert.equal(resolveWorkflowOutboxEvent("pass_through", config), null);
});

test("notification intent rejects arbitrary destinations and malformed references", () => {
  assert.throws(() => executeSafeAction("emit_notification_intent", {}, {
    recipient_ref: "https://attacker.example",
    template_key: "welcome",
  }), /config.recipient_ref_must_be_uuid/);
  assert.throws(() => resolveWorkflowOutboxEvent("emit_notification_intent", {
    recipient_ref: "81000000-4000-4000-8000-000000000001",
    template_key: "../arbitrary",
  }), /config.template_key_invalid/);
});
