import test from "node:test";
import assert from "node:assert/strict";
import { createApprovalAuthority } from "../server/ai/approval-authority.mjs";
import { createApprovedCapabilityService, ApprovedExecutionError } from "../server/ai/approved-capability-service.mjs";

const principal = Object.freeze({ subject: "verified-user-7" });
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
    claimTaskForExecution: async () => true,
  });
  return { service, calls };
}

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

test("requires execution permission even when an approval grant exists", async () => {
  const { service } = setup();
  const grant = await service.requestApproval(base);
  const blocked = createApprovedCapabilityService({
    approvalAuthority: { issue: () => grant, consume: () => true },
    capabilityExecutor: { run: () => assert.fail("must not execute") },
    authorize: async () => false,
    isTaskAwaitingApproval: async () => true,
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

test("fails closed when authorization or task-state callbacks throw", async () => {
  const authority = createApprovalAuthority();
  const service = createApprovedCapabilityService({
    approvalAuthority: authority,
    capabilityExecutor: { run: () => assert.fail("must not execute") },
    authorize: async () => { throw new Error("auth backend down"); },
    isTaskAwaitingApproval: async () => { throw new Error("task store down"); },
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
