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

test("runs only an agent-declared, runtime-present, policy-allowlisted local capability", async () => {
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

test("rejects unknown and disabled agents", async () => {
  const executor = setup();
  await assert.rejects(() => executor.run({
    agentId: "missing-agent", capabilityId: "text.metrics", input: { text: "safe" },
  }), (error) => error instanceof CapabilityExecutionError && error.code === "AGENT_NOT_FOUND");

  const disabled = setup({ agentRecord: { ...agent, status: "disabled" } });
  await assert.rejects(() => disabled.run({
    agentId: "local-helper", capabilityId: "text.metrics", input: { text: "safe" },
  }), (error) => error.code === "AGENT_DISABLED");
});

test("rejects undeclared, unavailable, and non-allowlisted capabilities", async () => {
  const executor = setup();
  await assert.rejects(() => executor.run({
    agentId: "local-helper", capabilityId: "shell.execute", input: {},
  }), (error) => error.code === "CAPABILITY_NOT_DECLARED");

  const restricted = setup({ allowedTools: [] });
  await assert.rejects(() => restricted.run({
    agentId: "local-helper", capabilityId: "text.metrics", input: { text: "safe" },
  }), (error) => error.code === "TOOL_NOT_ALLOWLISTED");
});

test("rejects pre-aborted and malformed signals", async () => {
  const executor = setup();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => executor.run({
    agentId: "local-helper", capabilityId: "text.metrics",
    input: { text: "safe" }, signal: controller.signal,
  }), (error) => error.code === "ABORTED");
  await assert.rejects(() => executor.run({
    agentId: "local-helper", capabilityId: "text.metrics",
    input: { text: "safe" }, signal: {},
  }), (error) => error.code === "INVALID_SIGNAL");
});

test("records metadata-only bounded audit events without input or output content", async () => {
  const executor = setup({ maxAuditEvents: 1 });
  await executor.run({
    agentId: "local-helper", capabilityId: "text.metrics",
    input: { text: "private user content" },
  });
  await executor.run({
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

test("normalizes adapter failures without leaking raw error messages", async () => {
  const executor = createLocalCapabilityExecutor({
    registry: createAgentRegistry([agent]),
    runtime: {
      listCapabilities: () => [{ id: "text.metrics", enabled: true }],
      run: () => { throw new Error("secret=do-not-leak"); },
    },
    policy: createExecutionPolicy({ allowedTools: [{ id: "text.metrics", risk: "compute" }] }),
  });
  await assert.rejects(() => executor.run({
    agentId: "local-helper", capabilityId: "text.metrics", input: { text: "safe" },
  }), (error) => {
    assert.equal(error.code, "CAPABILITY_FAILED");
    assert.equal(error.message.includes("do-not-leak"), false);
    return true;
  });
});

test("awaits asynchronous adapters and records completion only after resolution", async () => {
  let settled = false;
  const executor = createLocalCapabilityExecutor({
    registry: createAgentRegistry([agent]),
    runtime: {
      listCapabilities: () => [{ id: "text.metrics", enabled: true }],
      run: async () => {
        await Promise.resolve();
        settled = true;
        return { output: "done" };
      },
    },
    policy: createExecutionPolicy({ allowedTools: [{ id: "text.metrics", risk: "compute" }] }),
  });
  const pending = executor.run({ agentId: "local-helper", capabilityId: "text.metrics", input: {} });
  assert.equal(executor.getAuditEvents().length, 0);
  const result = await pending;
  assert.equal(settled, true);
  assert.deepEqual(result.result, { output: "done" });
  assert.equal(executor.getAuditEvents().at(-1).event, "capability_completed");
});

test("records async adapter rejection as failure and does not report completion", async () => {
  const executor = createLocalCapabilityExecutor({
    registry: createAgentRegistry([agent]),
    runtime: {
      listCapabilities: () => [{ id: "text.metrics", enabled: true }],
      run: async () => { await Promise.resolve(); throw new Error("secret=never-expose"); },
    },
    policy: createExecutionPolicy({ allowedTools: [{ id: "text.metrics", risk: "compute" }] }),
  });
  await assert.rejects(
    executor.run({ agentId: "local-helper", capabilityId: "text.metrics", input: {} }),
    (error) => error.code === "CAPABILITY_FAILED" && !error.message.includes("never-expose"),
  );
  assert.equal(executor.getAuditEvents().some((event) => event.event === "capability_completed"), false);
  assert.equal(executor.getAuditEvents().at(-1).event, "capability_failed");
});
