import test from "node:test";
import assert from "node:assert/strict";
import { createAgentRegistry } from "../server/ai/agent-registry.mjs";
import { createExecutionPolicy } from "../server/ai/policy.mjs";
import { createLocalAdapterRuntime } from "../server/integrations/local-adapter-runtime.mjs";
import { createLocalCapabilityExecutor, CapabilityExecutionError } from "../server/ai/capability-executor.mjs";

const agent = {
  id: "local-helper",
  name: "Local Helper",
  status: "ready",
  providerId: "local-runtime",
  capabilities: ["text.metrics", "task.preview"],
};

function setup({ agentRecord = agent, allowedTools = [
  { id: "text.metrics", risk: "compute" },
  { id: "task.preview", risk: "compute" },
], maxAuditEvents = 20 } = {}) {
  return createLocalCapabilityExecutor({
    registry: createAgentRegistry([agentRecord]),
    runtime: createLocalAdapterRuntime(),
    policy: createExecutionPolicy({ allowedTools }),
    maxAuditEvents,
    now: (() => { let tick = 100; return () => ++tick; })(),
  });
}

test("runs only an agent-declared, runtime-present, policy-allowlisted local capability", () => {
  const executor = setup();
  const result = executor.run({
    agentId: "local-helper",
    capabilityId: "text.metrics",
    input: { text: "Alpha beta\nGamma" },
  });
  assert.equal(result.status, "completed");
  assert.deepEqual(result.result.output, { characters: 16, words: 3, lines: 2 });
  assert.equal(result.result.sideEffects, "none");
});

test("rejects unknown and disabled agents", () => {
  const executor = setup();
  assert.throws(() => executor.run({
    agentId: "missing-agent", capabilityId: "text.metrics", input: { text: "safe" },
  }), (error) => error instanceof CapabilityExecutionError && error.code === "AGENT_NOT_FOUND");

  const disabled = setup({ agentRecord: { ...agent, status: "disabled" } });
  assert.throws(() => disabled.run({
    agentId: "local-helper", capabilityId: "text.metrics", input: { text: "safe" },
  }), (error) => error.code === "AGENT_DISABLED");
});

test("rejects undeclared, unavailable, and non-allowlisted capabilities", () => {
  const executor = setup();
  assert.throws(() => executor.run({
    agentId: "local-helper", capabilityId: "shell.execute", input: {},
  }), (error) => error.code === "CAPABILITY_NOT_DECLARED");

  const restricted = setup({ allowedTools: [] });
  assert.throws(() => restricted.run({
    agentId: "local-helper", capabilityId: "text.metrics", input: { text: "safe" },
  }), (error) => error.code === "TOOL_NOT_ALLOWLISTED");
});

test("rejects pre-aborted and malformed signals", () => {
  const executor = setup();
  const controller = new AbortController();
  controller.abort();
  assert.throws(() => executor.run({
    agentId: "local-helper", capabilityId: "text.metrics",
    input: { text: "safe" }, signal: controller.signal,
  }), (error) => error.code === "ABORTED");
  assert.throws(() => executor.run({
    agentId: "local-helper", capabilityId: "text.metrics",
    input: { text: "safe" }, signal: {},
  }), (error) => error.code === "INVALID_SIGNAL");
});

test("records metadata-only bounded audit events without input or output content", () => {
  const executor = setup({ maxAuditEvents: 1 });
  executor.run({
    agentId: "local-helper", capabilityId: "text.metrics",
    input: { text: "private user content" },
  });
  executor.run({
    agentId: "local-helper", capabilityId: "task.preview",
    input: { title: "Sensitive project title" },
  });
  const events = executor.getAuditEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].event, "capability_completed");
  assert.equal(JSON.stringify(events).includes("private user content"), false);
  assert.equal(JSON.stringify(events).includes("Sensitive project title"), false);
  assert.equal(Object.isFrozen(events), true);
});

test("normalizes adapter failures without leaking raw error messages", () => {
  const executor = createLocalCapabilityExecutor({
    registry: createAgentRegistry([agent]),
    runtime: {
      listCapabilities: () => [{ id: "text.metrics", enabled: true }],
      run: () => { throw new Error("secret=do-not-leak"); },
    },
    policy: createExecutionPolicy({ allowedTools: [{ id: "text.metrics", risk: "compute" }] }),
  });
  assert.throws(() => executor.run({
    agentId: "local-helper", capabilityId: "text.metrics", input: { text: "safe" },
  }), (error) => {
    assert.equal(error.code, "CAPABILITY_FAILED");
    assert.equal(error.message.includes("do-not-leak"), false);
    return true;
  });
});
