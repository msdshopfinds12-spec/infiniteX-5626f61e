import test from "node:test";
import assert from "node:assert/strict";
import { createApprovalTaskStoreAdapter, ApprovalTaskStoreError } from "../server/ai/approval-task-store-adapter.mjs";

const principal = Object.freeze({ subject: "user-verified-1" });
const row = () => ({
  taskId: "task-1",
  ownerSubject: "user-verified-1",
  taskVersion: "7",
  status: "awaiting_approval",
  agentId: "local-agent",
  agentVersion: "1.2.0",
  capabilityId: "text.metrics",
  capabilityVersion: "1.0.0",
  input: { text: "safe sample" },
});

test("loads only a server-owned approval snapshot for the verified principal", async () => {
  const calls = [];
  const adapter = createApprovalTaskStoreAdapter({
    store: {
      getApprovalSnapshot: async (query) => { calls.push(query); return row(); },
      claimApprovedTask: async () => true,
    },
  });
  const snapshot = await adapter.getTaskSnapshot({ taskId: "task-1", principal });
  assert.equal(snapshot.agentId, "local-agent");
  assert.deepEqual(calls[0], { taskId: "task-1", principalSubject: principal.subject });
  assert.equal(Object.isFrozen(snapshot), true);
});

test("does not disclose another owner's task as an approval snapshot", async () => {
  const adapter = createApprovalTaskStoreAdapter({
    store: {
      getApprovalSnapshot: async () => ({ ...row(), ownerSubject: "another-user" }),
      claimApprovedTask: async () => true,
    },
  });
  await assert.rejects(
    adapter.getTaskSnapshot({ taskId: "task-1", principal }),
    (error) => error instanceof ApprovalTaskStoreError && error.code === "TASK_NOT_AVAILABLE",
  );
  assert.equal(await adapter.isTaskAwaitingApproval("task-1", principal), false);
});

test("fails closed for malformed principal, missing task and unavailable storage", async () => {
  const adapter = createApprovalTaskStoreAdapter({
    store: {
      getApprovalSnapshot: async () => { throw new Error("private database details"); },
      claimApprovedTask: async () => true,
    },
  });
  await assert.rejects(
    adapter.getTaskSnapshot({ taskId: "task-1", principal: { subject: "" } }),
    (error) => error.code === "INVALID_PRINCIPAL_SUBJECT",
  );
  await assert.rejects(
    adapter.getTaskSnapshot({ taskId: "task-1", principal }),
    (error) => error.code === "TASK_STORE_UNAVAILABLE" && !error.message.includes("private"),
  );
  assert.equal(await adapter.isTaskAwaitingApproval("task-1", principal), false);
});

test("rejects incomplete or malformed trusted task snapshots", async () => {
  const adapter = createApprovalTaskStoreAdapter({
    store: {
      getApprovalSnapshot: async () => ({ ...row(), agentVersion: "" }),
      claimApprovedTask: async () => true,
    },
  });
  await assert.rejects(
    adapter.getTaskSnapshot({ taskId: "task-1", principal }),
    (error) => error.code === "INVALID_AGENTVERSION",
  );
});

test("delegates a fully scoped atomic compare-and-claim request to the durable store", async () => {
  let received;
  const adapter = createApprovalTaskStoreAdapter({
    store: {
      getApprovalSnapshot: async () => row(),
      claimApprovedTask: async (claim) => { received = claim; return true; },
    },
  });
  const claimed = await adapter.claimTaskForExecution({
    taskId: "task-1",
    taskVersion: "7",
    payloadHash: "a".repeat(64),
    principal,
    agentId: "local-agent",
    agentVersion: "1.2.0",
    capabilityId: "text.metrics",
    capabilityVersion: "1.0.0",
  });
  assert.equal(claimed, true);
  assert.deepEqual(received, {
    taskId: "task-1",
    principalSubject: principal.subject,
    expectedTaskVersion: "7",
    expectedPayloadHash: "a".repeat(64),
    expectedAgentId: "local-agent",
    expectedAgentVersion: "1.2.0",
    expectedCapabilityId: "text.metrics",
    expectedCapabilityVersion: "1.0.0",
    fromStatus: "awaiting_approval",
    toStatus: "running",
  });
});

test("does not treat false, thrown, or malformed claims as successful", async () => {
  const make = (claimApprovedTask) => createApprovalTaskStoreAdapter({
    store: { getApprovalSnapshot: async () => row(), claimApprovedTask },
  });
  const args = {
    taskId: "task-1", taskVersion: "7", payloadHash: "b".repeat(64),
    principal, agentId: "local-agent", agentVersion: "1.2.0",
    capabilityId: "text.metrics", capabilityVersion: "1.0.0",
  };
  assert.equal(await make(async () => false).claimTaskForExecution(args), false);
  assert.equal(await make(async () => { throw new Error("private"); }).claimTaskForExecution(args), false);
  assert.equal(await make(async () => "true").claimTaskForExecution(args), false);
  assert.equal(await make(async () => true).claimTaskForExecution({ ...args, payloadHash: "bad" }), false);
});

test("requires the complete store contract at construction", () => {
  assert.throws(() => createApprovalTaskStoreAdapter({ store: {} }), TypeError);
});


test("passes only a validated approval digest into the atomic durable claim driver", async () => {
  let received;
  const adapter = createApprovalTaskStoreAdapter({
    store: {
      getApprovalSnapshot: async () => row(),
      claimApprovedTask: async () => true,
      claimApprovedTaskWithApproval: async (claim) => { received = claim; return true; },
    },
  });
  const result = await adapter.claimTaskWithApproval({
    taskId: "task-1",
    taskVersion: "7",
    payloadHash: "c".repeat(64),
    tokenDigest: "d".repeat(64),
    principal,
    agentId: "local-agent",
    agentVersion: "1.2.0",
    capabilityId: "text.metrics",
    capabilityVersion: "1.0.0",
  });
  assert.equal(result, true);
  assert.equal(received.approvalTokenDigest, "d".repeat(64));
  assert.equal("token" in received, false);
  assert.equal(received.fromStatus, "awaiting_approval");
  assert.equal(received.toStatus, "running");
});

test("fails closed when the durable driver does not implement atomic approval claim", async () => {
  const adapter = createApprovalTaskStoreAdapter({
    store: {
      getApprovalSnapshot: async () => row(),
      claimApprovedTask: async () => true,
    },
  });
  assert.equal(await adapter.claimTaskWithApproval({
    taskId: "task-1", taskVersion: "7",
    payloadHash: "e".repeat(64), tokenDigest: "f".repeat(64),
    principal, agentId: "local-agent", agentVersion: "1.2.0",
    capabilityId: "text.metrics", capabilityVersion: "1.0.0",
  }), false);
});
