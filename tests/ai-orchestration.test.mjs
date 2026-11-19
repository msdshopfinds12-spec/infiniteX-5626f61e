import test from "node:test";
import assert from "node:assert/strict";
import { createExecutionPolicy } from "../server/ai/policy.mjs";
import { createAgentRegistry } from "../server/ai/agent-registry.mjs";
import { createOrchestrator, OrchestrationError } from "../server/ai/orchestrator.mjs";

const readyAgent = {
  id: "planner",
  name: "Planning Agent",
  status: "ready",
  providerId: "local-test",
  capabilities: ["plan", "summarize"],
  systemPrompt: "Return a concise plan.",
};

function makePolicy(overrides = {}) {
  return createExecutionPolicy({
    allowedProviders: ["local-test"],
    maxEstimatedCostUsd: 0,
    ...overrides,
  });
}

function makeRegistry(agent = readyAgent) {
  return createAgentRegistry([agent]);
}

test("default policy denies every provider and keeps cost ceiling at zero", () => {
  const policy = createExecutionPolicy();
  assert.equal(policy.limits.maxEstimatedCostUsd, 0);
  assert.deepEqual(
    policy.evaluateModelRequest({
      providerId: "any-provider",
      input: "hello",
      estimatedCostUsd: 0,
    }),
    { allowed: false, code: "PROVIDER_NOT_ALLOWED" },
  );
});

test("model policy enforces provider allowlist, input size, step count, and budget", () => {
  const policy = makePolicy({ maxInputChars: 5, maxRunSteps: 2 });
  assert.equal(policy.evaluateModelRequest({
    providerId: "unknown", input: "hi", estimatedCostUsd: 0,
  }).code, "PROVIDER_NOT_ALLOWED");
  assert.equal(policy.evaluateModelRequest({
    providerId: "local-test", input: "123456", estimatedCostUsd: 0,
  }).code, "INPUT_LIMIT_EXCEEDED");
  assert.equal(policy.evaluateModelRequest({
    providerId: "local-test", input: "hi", estimatedCostUsd: 0, steps: 3,
  }).code, "STEP_LIMIT_EXCEEDED");
  assert.equal(policy.evaluateModelRequest({
    providerId: "local-test", input: "hi", estimatedCostUsd: 0.01,
  }).code, "BUDGET_LIMIT_EXCEEDED");
  assert.equal(policy.evaluateModelRequest({
    providerId: "local-test", input: "hello", estimatedCostUsd: 0,
  }).allowed, true);
});

test("tool policy allows only allowlisted read tools by default", () => {
  const policy = createExecutionPolicy({
    allowedTools: [{ id: "read-project-summary", risk: "read" }],
  });
  assert.equal(policy.evaluateToolRequest({
    toolId: "read-project-summary", risk: "read",
  }).allowed, true);
  assert.equal(policy.evaluateToolRequest({
    toolId: "write-file", risk: "write",
  }).code, "TOOL_NOT_ALLOWLISTED");
});

test("write tools require verified scoped approval and destructive tools remain blocked", () => {
  const policy = createExecutionPolicy({
    allowedTools: [
      { id: "create-branch", risk: "write" },
      { id: "delete-repository", risk: "destructive" },
    ],
    verifyApproval: (approval, context) =>
      approval?.signature === "verified" && approval?.scope === context.toolId,
  });
  assert.equal(policy.evaluateToolRequest({
    toolId: "create-branch", risk: "write",
  }).code, "APPROVAL_REQUIRED");
  assert.equal(policy.evaluateToolRequest({
    toolId: "create-branch", risk: "write",
    approval: { signature: "verified", scope: "other-action" },
  }).allowed, false);
  assert.equal(policy.evaluateToolRequest({
    toolId: "create-branch", risk: "write",
    approval: { signature: "verified", scope: "create-branch" },
  }).allowed, true);
  assert.equal(policy.evaluateToolRequest({
    toolId: "delete-repository", risk: "destructive",
    approval: { signature: "verified", scope: "delete-repository" },
  }).code, "DESTRUCTIVE_TOOL_BLOCKED");
});

test("agent registry validates records, freezes metadata, and rejects duplicates", () => {
  const registry = makeRegistry();
  const agent = registry.get("planner");
  assert.equal(agent.status, "ready");
  assert.equal(Object.isFrozen(agent), true);
  assert.equal(Object.isFrozen(agent.capabilities), true);
  assert.throws(
    () => registry.register(readyAgent),
    (error) => error.code === "DUPLICATE_AGENT",
  );
  assert.throws(
    () => createAgentRegistry([{ ...readyAgent, id: "Bad ID" }]),
    (error) => error.code === "INVALID_AGENT_ID",
  );
});

test("orchestrator never calls providers unless explicitly allowlisted and enabled", async () => {
  let calls = 0;
  const registry = makeRegistry();
  const disabledPolicy = createExecutionPolicy();
  const disabledOrchestrator = createOrchestrator({
    registry,
    policy: disabledPolicy,
    providers: {
      "local-test": {
        enabled: true,
        estimatedCostUsd: 0,
        generate: async () => { calls += 1; return "should not run"; },
      },
    },
  });
  await assert.rejects(
    disabledOrchestrator.run({ agentId: "planner", input: "Plan safely." }),
    (error) => error instanceof OrchestrationError && error.code === "PROVIDER_NOT_ALLOWED",
  );
  assert.equal(calls, 0);

  const noProvider = createOrchestrator({
    registry,
    policy: makePolicy(),
    providers: {},
  });
  await assert.rejects(
    noProvider.run({ agentId: "planner", input: "Plan safely." }),
    (error) => error.code === "PROVIDER_UNAVAILABLE",
  );
});

test("orchestrator completes one bounded provider call and emits metadata-only audit events", async () => {
  const registry = makeRegistry();
  const orchestrator = createOrchestrator({
    registry,
    policy: makePolicy(),
    providers: {
      "local-test": {
        enabled: true,
        estimatedCostUsd: 0,
        generate: async ({ input, systemPrompt, maxOutputChars }) => {
          assert.equal(systemPrompt, readyAgent.systemPrompt);
          assert.ok(maxOutputChars > 0);
          return "Plan: " + input;
        },
      },
    },
    idFactory: () => "run-test-1",
    now: (() => { let value = 100; return () => value += 5; })(),
  });

  const result = await orchestrator.run({ agentId: "planner", input: "review the plan" });
  assert.equal(result.status, "completed");
  assert.equal(result.runId, "run-test-1");
  assert.equal(result.output, "Plan: review the plan");
  assert.equal(result.durationMs, 5);

  const events = orchestrator.getAuditEvents();
  assert.deepEqual(events.map((event) => event.event), ["run_started", "run_completed"]);
  assert.equal(JSON.stringify(events).includes("review the plan"), false);
  assert.equal(JSON.stringify(events).includes("Plan:"), false);
});

test("orchestrator rejects disabled agents and oversized provider output", async () => {
  const disabledRegistry = makeRegistry({ ...readyAgent, status: "disabled" });
  const provider = {
    enabled: true,
    estimatedCostUsd: 0,
    generate: async () => "x".repeat(20),
  };
  const disabled = createOrchestrator({
    registry: disabledRegistry, policy: makePolicy(), providers: { "local-test": provider },
  });
  await assert.rejects(
    disabled.run({ agentId: "planner", input: "hello" }),
    (error) => error.code === "AGENT_DISABLED",
  );

  const bounded = createOrchestrator({
    registry: makeRegistry(),
    policy: makePolicy({ maxOutputChars: 10 }),
    providers: { "local-test": provider },
  });
  await assert.rejects(
    bounded.run({ agentId: "planner", input: "hello" }),
    (error) => error.code === "OUTPUT_LIMIT_EXCEEDED",
  );
});

test("orchestrator distinguishes timeout from caller cancellation", async () => {
  const registry = makeRegistry();
  const slowProvider = {
    enabled: true,
    estimatedCostUsd: 0,
    generate: (_request) => new Promise(() => {}),
  };
  const timed = createOrchestrator({
    registry, policy: makePolicy(), providers: { "local-test": slowProvider }, timeoutMs: 100,
  });
  await assert.rejects(
    timed.run({ agentId: "planner", input: "hello" }),
    (error) => error.code === "TIMEOUT",
  );

  const controller = new AbortController();
  controller.abort();
  const cancelled = createOrchestrator({
    registry,
    policy: makePolicy(),
    providers: {
      "local-test": {
        ...slowProvider,
        generate: (_request) => new Promise((_resolve, reject) => {
          reject(new Error("cancelled"));
        }),
      },
    },
  });
  await assert.rejects(
    cancelled.run({ agentId: "planner", input: "hello", signal: controller.signal }),
    (error) => error.code === "ABORTED",
  );
});


test("retains concurrency capacity after timeout until an uncooperative provider actually settles", async () => {
  let releaseFirst;
  let calls = 0;
  const firstPending = new Promise((resolve) => { releaseFirst = resolve; });
  const orchestrator = createOrchestrator({
    registry: makeRegistry(),
    policy: makePolicy(),
    timeoutMs: 100,
    maxConcurrentRuns: 1,
    providers: {
      "local-test": {
        enabled: true,
        estimatedCostUsd: 0,
        generate: async () => {
          calls += 1;
          if (calls === 1) return firstPending; // deliberately ignores AbortSignal
          return "completed";
        },
      },
    },
  });

  await assert.rejects(
    orchestrator.run({ agentId: "planner", input: "first request" }),
    (error) => error.code === "TIMEOUT",
  );
  await assert.rejects(
    orchestrator.run({ agentId: "planner", input: "second request" }),
    (error) => error.code === "RUN_CAPACITY_EXCEEDED",
  );
  assert.equal(calls, 1, "capacity rejection must happen before another provider call");

  releaseFirst("late completion");
  await new Promise((resolve) => setImmediate(resolve));
  const recovered = await orchestrator.run({ agentId: "planner", input: "third request" });
  assert.equal(recovered.status, "completed");
  assert.equal(recovered.output, "completed");
  assert.equal(calls, 2);
});

test("validates AbortSignal shape and orchestrator concurrency configuration", async () => {
  assert.throws(() => createOrchestrator({
    registry: makeRegistry(),
    policy: makePolicy(),
    maxConcurrentRuns: 0,
  }), /maxConcurrentRuns/);
  const orchestrator = createOrchestrator({
    registry: makeRegistry(),
    policy: makePolicy(),
    providers: {
      "local-test": { enabled: true, estimatedCostUsd: 0, generate: async () => "ok" },
    },
  });
  await assert.rejects(
    orchestrator.run({ agentId: "planner", input: "hello", signal: { aborted: false } }),
    (error) => error.code === "INVALID_SIGNAL",
  );
});

test("provider failures are normalized without leaking provider error messages", async () => {
  const orchestrator = createOrchestrator({
    registry: makeRegistry(),
    policy: makePolicy(),
    providers: {
      "local-test": {
        enabled: true,
        estimatedCostUsd: 0,
        generate: async () => { throw new Error("private provider token abc123"); },
      },
    },
  });
  await assert.rejects(
    orchestrator.run({ agentId: "planner", input: "hello" }),
    (error) => {
      assert.equal(error.code, "PROVIDER_FAILED");
      assert.equal(error.message.includes("abc123"), false);
      return true;
    },
  );
});


test("orchestrator ignores inherited provider properties and bounds audit memory", async () => {
  const registry = makeRegistry({
    ...readyAgent,
    providerId: "toString",
  });
  const inheritedProviderMap = {};
  const orchestrator = createOrchestrator({
    registry,
    policy: createExecutionPolicy({ allowedProviders: ["toString"], maxEstimatedCostUsd: 0 }),
    providers: inheritedProviderMap,
    maxAuditEvents: 1,
  });
  await assert.rejects(
    orchestrator.run({ agentId: "planner", input: "hello" }),
    (error) => error.code === "PROVIDER_UNAVAILABLE",
  );
  assert.equal(orchestrator.getAuditEvents().length, 0);

  const eventsRegistry = makeRegistry();
  const eventsOrchestrator = createOrchestrator({
    registry: eventsRegistry,
    policy: makePolicy(),
    providers: {
      "local-test": {
        enabled: true,
        estimatedCostUsd: 0,
        generate: async () => "done",
      },
    },
    maxAuditEvents: 1,
  });
  await eventsOrchestrator.run({ agentId: "planner", input: "hello" });
  assert.equal(eventsOrchestrator.getAuditEvents().length, 1);
  assert.equal(eventsOrchestrator.getAuditEvents()[0].event, "run_completed");
});
