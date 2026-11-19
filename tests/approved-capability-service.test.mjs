import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createApprovalAuthority } from "../server/ai/approval-authority.mjs";
import { createApprovedCapabilityService, ApprovedExecutionError } from "../server/ai/approved-capability-service.mjs";

const principal = Object.freeze({ subject: "verified-user-7" });
const createHashForTest = (token) => createHash("sha256").update(token, "utf8").digest("hex");
const base = {
  principal,
  taskId: "task-100",
  agentId: "local-helper",
  capabilityId: "text.metrics",
  capabilityVersion: "1.0.0",
  input: { text: "safe local work" },
};

function setup({ authorized = true, awaiting = true, failExecution = false } = {}) {
  let sequence = 0;
  const authority = createApprovalAuthority({
    now: () => 50_000,
    tokenFactory: () => "service_token_" + String(++sequence).padStart(40, "0"),
  });
  const calls = [];
  const service = createApprovedCapabilityService({
    approvalAuthority: authority,
    capabilityExecutor: {
      run: (request) => {
        calls.push(request);
        if (failExecution) throw new Error("private internal error");
        return { status: "completed", result: "local-result" };
      },
    },
    authorize: async (_principal, request) => {
      assert.equal(_principal, principal);
      return authorized && ["approve", "execute"].includes(request.operation);
    },
    isTaskAwaitingApproval: async () => awaiting,
    getTaskSnapshot: async ({ taskId }) => ({
      taskId, taskVersion: "3", status: "awaiting_approval",
      agentId: "local-helper", agentVersion: "2.1.0",
      capabilityId: "text.metrics", capabilityVersion: "1.0.0",
      input: { text: "safe local work" },
    }),
    claimTaskForExecution: async () => true,
  });
  return { service, calls };
}


test("binds approval to immutable server-owned task payload and ignores browser replacement input", async () => {
  let serverInput = { text: "approved original payload" };
  const authority = createApprovalAuthority({
    now: () => 50_000,
    tokenFactory: () => "payload_binding_token_" + "p".repeat(32),
  });
  const calls = [];
  const service = createApprovedCapabilityService({
    approvalAuthority: authority,
    capabilityExecutor: { run: (request) => { calls.push(request); return { status: "completed" }; } },
    authorize: async () => true,
    isTaskAwaitingApproval: async () => true,
    getTaskSnapshot: async ({ taskId }) => ({
      taskId, taskVersion: "9", status: "awaiting_approval",
      agentId: "trusted-agent", agentVersion: "4.2.0",
      capabilityId: "text.metrics", capabilityVersion: "1.0.0",
      input: serverInput,
    }),
    claimTaskForExecution: async () => true,
  });
  const grant = await service.requestApproval(base);
  await service.executeApproved({
    principal, taskId: base.taskId, capabilityId: base.capabilityId,
    capabilityVersion: base.capabilityVersion, approvalToken: grant.token,
    agentId: "attacker-agent", input: { text: "replacement payload" },
  });
  assert.equal(calls[0].agentId, "trusted-agent");
  assert.deepEqual(calls[0].input, { text: "approved original payload" });
});

test("rejects approval when server-owned payload changes after approval", async () => {
  let serverInput = { text: "approved payload" };
  const authority = createApprovalAuthority({
    now: () => 50_000,
    tokenFactory: () => "changed_payload_token_" + "c".repeat(32),
  });
  const service = createApprovedCapabilityService({
    approvalAuthority: authority,
    capabilityExecutor: { run: () => assert.fail("must not execute changed payload") },
    authorize: async () => true,
    isTaskAwaitingApproval: async () => true,
    getTaskSnapshot: async ({ taskId }) => ({
      taskId, taskVersion: "9", status: "awaiting_approval",
      agentId: "trusted-agent", agentVersion: "4.2.0",
      capabilityId: "text.metrics", capabilityVersion: "1.0.0",
      input: serverInput,
    }),
    claimTaskForExecution: async () => true,
  });
  const grant = await service.requestApproval(base);
  serverInput = { text: "changed after approval" };
  await assert.rejects(
    service.executeApproved({ principal, taskId: base.taskId, capabilityId: base.capabilityId, capabilityVersion: base.capabilityVersion, approvalToken: grant.token }),
    (error) => error.code === "APPROVAL_INVALID_OR_EXPIRED",
  );
});


test("detaches execution input from mutable storage snapshots before asynchronous task claims", async () => {
  const serverInput = { nested: { text: "approved immutable value" } };
  const authority = createApprovalAuthority({
    now: () => 50_000,
    tokenFactory: () => "detached_input_token_" + "d".repeat(32),
  });
  const calls = [];
  const service = createApprovedCapabilityService({
    approvalAuthority: authority,
    capabilityExecutor: { run: (request) => { calls.push(request); return { status: "completed" }; } },
    authorize: async () => true,
    isTaskAwaitingApproval: async () => true,
    getTaskSnapshot: async ({ taskId }) => ({
      taskId, taskVersion: "12", status: "awaiting_approval",
      agentId: "trusted-agent", agentVersion: "4.2.0",
      capabilityId: "text.metrics", capabilityVersion: "1.0.0",
      input: serverInput,
    }),
    claimTaskForExecution: async () => {
      serverInput.nested.text = "mutated during async claim";
      return true;
    },
  });
  const grant = await service.requestApproval(base);
  await service.executeApproved({
    principal, taskId: base.taskId, capabilityId: base.capabilityId,
    capabilityVersion: base.capabilityVersion, approvalToken: grant.token,
  });
  assert.deepEqual(calls[0].input, { nested: { text: "approved immutable value" } });
});

test("requires authorized principal and trusted task state before issuing approval", async () => {
  const denied = setup({ authorized: false });
  await assert.rejects(
    denied.service.requestApproval(base),
    (error) => error instanceof ApprovedExecutionError && error.code === "APPROVAL_FORBIDDEN",
  );
  const notPending = setup({ awaiting: false });
  await assert.rejects(
    notPending.service.requestApproval(base),
    (error) => error.code === "TASK_NOT_AWAITING_APPROVAL",
  );
});

test("executes only after a scoped approval has been issued and consumed", async () => {
  const { service, calls } = setup();
  const grant = await service.requestApproval(base);
  const result = await service.executeApproved({ ...base, approvalToken: grant.token });
  assert.deepEqual(result, { status: "completed", result: "local-result" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].agentId, "local-helper");
});

test("rejects forged, cross-task, cross-capability, and replayed approvals", async () => {
  const { service, calls } = setup();
  const grant = await service.requestApproval(base);
  await assert.rejects(
    service.executeApproved({ ...base, taskId: "other-task", approvalToken: grant.token }),
    (error) => error.code === "APPROVAL_INVALID_OR_EXPIRED",
  );
  await assert.rejects(
    service.executeApproved({ ...base, approvalToken: "forged_token_".padEnd(40, "x") }),
    (error) => error.code === "APPROVAL_INVALID_OR_EXPIRED",
  );
  await service.executeApproved({ ...base, approvalToken: grant.token });
  await assert.rejects(
    service.executeApproved({ ...base, approvalToken: grant.token }),
    (error) => error.code === "APPROVAL_INVALID_OR_EXPIRED",
  );
  assert.equal(calls.length, 1);
});


test("awaits asynchronous approval consumption and rejects an unresolved/denied durable grant", async () => {
  let executionCount = 0;
  const authority = createApprovalAuthority({
    now: () => 50_000,
    tokenFactory: () => "async_consume_token_" + "z".repeat(32),
  });
  const service = createApprovedCapabilityService({
    approvalAuthority: {
      issue: async (args) => authority.issue(args),
      consume: async (args) => {
        await Promise.resolve();
        return authority.consume(args);
      },
    },
    capabilityExecutor: {
      run: () => {
        executionCount += 1;
        return { status: "completed" };
      },
    },
    authorize: async () => true,
    isTaskAwaitingApproval: async () => true,
    getTaskSnapshot: async ({ taskId }) => ({
      taskId,
      taskVersion: "3",
      status: "awaiting_approval",
      agentId: "local-helper",
      agentVersion: "2.1.0",
      capabilityId: "text.metrics",
      capabilityVersion: "1.0.0",
      input: { text: "safe local work" },
    }),
    claimTaskForExecution: async () => true,
  });

  const grant = await service.requestApproval(base);
  await service.executeApproved({ ...base, approvalToken: grant.token });
  assert.equal(executionCount, 1);

  const deniedService = createApprovedCapabilityService({
    approvalAuthority: {
      issue: async () => ({ token: "async_denied_token_" + "d".repeat(32) }),
      consume: async () => {
        await Promise.resolve();
        return false;
      },
    },
    capabilityExecutor: {
      run: () => {
        executionCount += 1;
        return { status: "must-not-run" };
      },
    },
    authorize: async () => true,
    isTaskAwaitingApproval: async () => true,
    getTaskSnapshot: async ({ taskId }) => ({
      taskId,
      taskVersion: "3",
      status: "awaiting_approval",
      agentId: "local-helper",
      agentVersion: "2.1.0",
      capabilityId: "text.metrics",
      capabilityVersion: "1.0.0",
      input: { text: "safe local work" },
    }),
    claimTaskForExecution: async () => true,
  });
  const deniedGrant = await deniedService.requestApproval(base);
  await assert.rejects(
    deniedService.executeApproved({ ...base, approvalToken: deniedGrant.token }),
    (error) => error.code === "APPROVAL_INVALID_OR_EXPIRED",
  );
  assert.equal(executionCount, 1);
});

test("requires execution permission even when an approval grant exists", async () => {
  const { service } = setup();
  const grant = await service.requestApproval(base);
  const blocked = createApprovedCapabilityService({
    approvalAuthority: { issue: () => grant, consume: () => true },
    capabilityExecutor: { run: () => assert.fail("must not execute") },
    authorize: async () => false,
    isTaskAwaitingApproval: async () => true,
    getTaskSnapshot: async ({ taskId }) => ({ taskId, taskVersion: "3", status: "awaiting_approval", agentId: "local-helper", agentVersion: "2.1.0", capabilityId: "text.metrics", capabilityVersion: "1.0.0", input: { text: "safe local work" } }),
    claimTaskForExecution: async () => true,
  });
  await assert.rejects(
    blocked.executeApproved({ ...base, approvalToken: grant.token }),
    (error) => error.code === "EXECUTION_FORBIDDEN",
  );
});

test("consumes the approval before execution and never leaks adapter errors", async () => {
  const { service } = setup({ failExecution: true });
  const grant = await service.requestApproval(base);
  await assert.rejects(
    service.executeApproved({ ...base, approvalToken: grant.token }),
    (error) => error.code === "CAPABILITY_EXECUTION_FAILED" && !error.message.includes("private"),
  );
  await assert.rejects(
    service.executeApproved({ ...base, approvalToken: grant.token }),
    (error) => error.code === "APPROVAL_INVALID_OR_EXPIRED",
  );
});

test("normalizes asynchronous executor rejection and keeps the approval spent", async () => {
  let calls = 0;
  const authority = createApprovalAuthority({
    now: () => 50_000,
    tokenFactory: () => "async_failure_token_" + "a".repeat(32),
  });
  const service = createApprovedCapabilityService({
    approvalAuthority: authority,
    capabilityExecutor: {
      run: async () => {
        calls += 1;
        await Promise.resolve();
        throw new Error("private asynchronous adapter detail");
      },
    },
    authorize: async () => true,
    isTaskAwaitingApproval: async () => true,
    getTaskSnapshot: async ({ taskId }) => ({ taskId, taskVersion: "3", status: "awaiting_approval", agentId: "local-helper", agentVersion: "2.1.0", capabilityId: "text.metrics", capabilityVersion: "1.0.0", input: { text: "safe local work" } }),
    claimTaskForExecution: async () => true,
  });
  const grant = await service.requestApproval(base);
  await assert.rejects(
    service.executeApproved({ ...base, approvalToken: grant.token }),
    (error) => error.code === "CAPABILITY_EXECUTION_FAILED" &&
      !error.message.includes("private asynchronous adapter detail"),
  );
  await assert.rejects(
    service.executeApproved({ ...base, approvalToken: grant.token }),
    (error) => error.code === "APPROVAL_INVALID_OR_EXPIRED",
  );
  assert.equal(calls, 1);
});


test("bounds concurrent approved executions and releases capacity after completion", async () => {
  let sequence = 0;
  let releaseExecution;
  let markStarted;
  const started = new Promise((resolve) => { markStarted = resolve; });
  const pending = new Promise((resolve) => { releaseExecution = resolve; });
  const authority = createApprovalAuthority({
    now: () => 50_000,
    tokenFactory: () => "capacity_token_" + String(++sequence).padStart(40, "0"),
  });
  const service = createApprovedCapabilityService({
    approvalAuthority: authority,
    capabilityExecutor: {
      run: async () => {
        markStarted();
        await pending;
        return { status: "completed" };
      },
    },
    authorize: async () => true,
    isTaskAwaitingApproval: async () => true,
    getTaskSnapshot: async ({ taskId }) => ({ taskId, taskVersion: "3", status: "awaiting_approval", agentId: "local-helper", agentVersion: "2.1.0", capabilityId: "text.metrics", capabilityVersion: "1.0.0", input: { text: "safe local work" } }),
    claimTaskForExecution: async () => true,
    maxConcurrentExecutions: 1,
  });
  const firstGrant = await service.requestApproval(base);
  const secondGrant = await service.requestApproval({ ...base, taskId: "task-101" });
  const firstExecution = service.executeApproved({ ...base, approvalToken: firstGrant.token });
  await started;
  await assert.rejects(
    service.executeApproved({ ...base, taskId: "task-101", approvalToken: secondGrant.token }),
    (error) => error.code === "EXECUTION_CAPACITY_EXCEEDED",
  );
  releaseExecution();
  const result = await firstExecution;
  assert.equal(result.status, "completed");
  const retryGrant = await service.requestApproval({ ...base, taskId: "task-102" });
  const retry = await service.executeApproved({ ...base, taskId: "task-102", approvalToken: retryGrant.token });
  assert.equal(retry.status, "completed");
});

test("validates the configured concurrency ceiling and rejects pre-aborted signals without spending approval", async () => {
  const { service } = setup();
  assert.throws(() => createApprovedCapabilityService({
    approvalAuthority: { issue: () => ({}), consume: () => true },
    capabilityExecutor: { run: () => ({}) },
    authorize: async () => true,
    isTaskAwaitingApproval: async () => true,
    getTaskSnapshot: async ({ taskId }) => ({ taskId, taskVersion: "3", status: "awaiting_approval", agentId: "local-helper", agentVersion: "2.1.0", capabilityId: "text.metrics", capabilityVersion: "1.0.0", input: { text: "safe local work" } }),
    claimTaskForExecution: async () => true,
    maxConcurrentExecutions: 0,
  }), /maxConcurrentExecutions/);
  const grant = await service.requestApproval(base);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    service.executeApproved({ ...base, approvalToken: grant.token, signal: controller.signal }),
    (error) => error.code === "ABORTED",
  );
  const result = await service.executeApproved({ ...base, approvalToken: grant.token });
  assert.equal(result.status, "completed");
});

test("fails closed when authorization or task-state callbacks throw", async () => {
  const authority = createApprovalAuthority();
  const service = createApprovedCapabilityService({
    approvalAuthority: authority,
    capabilityExecutor: { run: () => assert.fail("must not execute") },
    authorize: async () => { throw new Error("auth backend down"); },
    isTaskAwaitingApproval: async () => { throw new Error("task store down"); },
    getTaskSnapshot: async () => null,
    claimTaskForExecution: async () => false,
  });
  await assert.rejects(
    service.requestApproval(base),
    (error) => error.code === "APPROVAL_FORBIDDEN",
  );
});

test("requires an atomic task claim and rejects duplicate execution attempts", async () => {
  const authority = createApprovalAuthority({
    now: () => 50_000,
    tokenFactory: (() => { let n = 0; return () => "race_token_" + String(++n).padStart(40, "0"); })(),
  });
  let claimed = false;
  let executionCount = 0;
  const service = createApprovedCapabilityService({
    approvalAuthority: authority,
    capabilityExecutor: { run: () => { executionCount += 1; return { status: "completed" }; } },
    authorize: async () => true,
    isTaskAwaitingApproval: async () => true,
    getTaskSnapshot: async ({ taskId }) => ({ taskId, taskVersion: "3", status: "awaiting_approval", agentId: "local-helper", agentVersion: "2.1.0", capabilityId: "text.metrics", capabilityVersion: "1.0.0", input: { text: "safe local work" } }),
    claimTaskForExecution: async () => {
      if (claimed) return false;
      claimed = true;
      return true;
    },
  });
  const first = await service.requestApproval(base);
  const second = await service.requestApproval(base);
  await service.executeApproved({ ...base, approvalToken: first.token });
  await assert.rejects(
    service.executeApproved({ ...base, approvalToken: second.token }),
    (error) => error.code === "TASK_CLAIM_FAILED",
  );
  assert.equal(executionCount, 1);
});


test("uses one atomic durable operation for approval consumption and task claim", async () => {
  const authority = createApprovalAuthority({
    now: () => 50_000,
    tokenFactory: () => "atomic_claim_token_" + "a".repeat(32),
  });
  let atomicRequest;
  let legacyConsumeCalled = false;
  let legacyClaimCalled = false;
  let executionCount = 0;
  const service = createApprovedCapabilityService({
    approvalAuthority: {
      issue: (args) => authority.issue(args),
      consume: async (args) => { legacyConsumeCalled = true; return authority.consume(args); },
    },
    claimTaskWithApproval: async (request) => {
      atomicRequest = request;
      return true;
    },
    capabilityExecutor: { run: async () => { executionCount += 1; return { status: "completed" }; } },
    authorize: async () => true,
    isTaskAwaitingApproval: async () => true,
    getTaskSnapshot: async ({ taskId }) => ({
      taskId, taskVersion: "3", status: "awaiting_approval",
      agentId: "local-helper", agentVersion: "2.1.0",
      capabilityId: "text.metrics", capabilityVersion: "1.0.0",
      input: { text: "safe local work" },
    }),
  });
  const grant = await service.requestApproval(base);
  await service.executeApproved({ ...base, approvalToken: grant.token });
  assert.equal(legacyConsumeCalled, false);
  assert.equal(legacyClaimCalled, false);
  assert.equal(atomicRequest.tokenDigest, createHashForTest(grant.token));
  assert.equal("token" in atomicRequest, false);
  assert.equal(atomicRequest.fromStatus, "awaiting_approval");
  assert.equal(atomicRequest.toStatus, "running");
  assert.equal(executionCount, 1);
});

test("does not execute when the atomic approval-and-claim transaction fails", async () => {
  const authority = createApprovalAuthority({
    now: () => 50_000,
    tokenFactory: () => "atomic_fail_token_" + "f".repeat(32),
  });
  let executionCount = 0;
  const service = createApprovedCapabilityService({
    approvalAuthority: authority,
    claimTaskWithApproval: async () => false,
    capabilityExecutor: { run: async () => { executionCount += 1; } },
    authorize: async () => true,
    isTaskAwaitingApproval: async () => true,
    getTaskSnapshot: async ({ taskId }) => ({
      taskId, taskVersion: "3", status: "awaiting_approval",
      agentId: "local-helper", agentVersion: "2.1.0",
      capabilityId: "text.metrics", capabilityVersion: "1.0.0",
      input: { text: "safe local work" },
    }),
  });
  const grant = await service.requestApproval(base);
  await assert.rejects(
    service.executeApproved({ ...base, approvalToken: grant.token }),
    (error) => error.code === "APPROVAL_OR_CLAIM_FAILED",
  );
  assert.equal(executionCount, 0);
});
