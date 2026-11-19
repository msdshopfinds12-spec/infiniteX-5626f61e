import test from "node:test";
import assert from "node:assert/strict";
import { createFakeTwoStageApprovalStore } from "./helpers/fake-two-stage-approval-store.mjs";

const initialTime = 1_800_000_000_000;
const digest = "a".repeat(64);

function createFixture() {
  const store = createFakeTwoStageApprovalStore({ now: () => initialTime });
  store.seedTask({
    taskId: "task-fake-1",
    status: "awaiting_approval",
    ownerSubject: "principal-1",
    taskVersion: "v1",
    payloadHash: "b".repeat(64),
    agentId: "agent-safe",
    agentVersion: "1.0.0",
    capabilityId: "text.summary",
    capabilityVersion: "1.0.0",
    version: 1,
  });
  const common = {
    taskId: "task-fake-1",
    principalSubject: "principal-1",
    expectedTaskVersion: "v1",
    expectedPayloadHash: "b".repeat(64),
    expectedAgentId: "agent-safe",
    expectedAgentVersion: "1.0.0",
    expectedCapabilityId: "text.summary",
    expectedCapabilityVersion: "1.0.0",
  };
  return { store, common };
}

async function issue(store, common, idempotencyKey = "issue-1") {
  return store.issueApprovalGrantV1({
    ...common,
    approvalTokenDigest: digest,
    ttlMs: 60_000,
    idempotencyKey,
  });
}

function claimRequest(common, workerSubject = "worker-1", idempotencyKey = "claim-1") {
  return {
    ...common,
    workerSubject,
    approvalTokenDigest: digest,
    leaseDurationMs: 30_000,
    idempotencyKey,
  };
}

test("fake durable contract models approval, digest consumption, and lease creation", async () => {
  const { store, common } = createFixture();
  const approved = await issue(store, common);
  assert.equal(approved.outcome, "issued");
  assert.equal(approved.task.status, "approved");
  assert.equal(store.getGrantCount(), 1);
  const claimed = await store.claimApprovedTaskV1(claimRequest(common));
  assert.equal(claimed.outcome, "claimed");
  assert.equal(claimed.task.status, "running");
  assert.equal(claimed.lease.workerSubject, "worker-1");
  assert.equal(claimed.lease.fencingToken, 1);
  assert.equal(store.getEvents().map((event) => event.type).join(","), "approved,claimed");
});

test("grant issuance idempotency does not create a second digest after a lost response", async () => {
  const { store, common } = createFixture();
  const first = await issue(store, common, "stable-approval-key");
  const replay = await store.issueApprovalGrantV1({
    ...common,
    approvalTokenDigest: "c".repeat(64),
    ttlMs: 60_000,
    idempotencyKey: "stable-approval-key",
  });
  assert.equal(first.outcome, "issued");
  assert.deepEqual(replay, { outcome: "already_issued" });
  assert.equal(store.getGrantCount(), 1);
  assert.equal(store.snapshotTask(common.taskId).status, "approved");
});

test("fake store rejects expired grants and cannot claim them", async () => {
  const { store, common } = createFixture();
  await issue(store, common);
  store.advanceTime(60_000);
  const result = await store.claimApprovedTaskV1(claimRequest(common));
  assert.deepEqual(result, { outcome: "not_available" });
  assert.equal(store.snapshotTask(common.taskId).status, "approved");
});

test("competing workers produce exactly one successful claim", async () => {
  const { store, common } = createFixture();
  await issue(store, common);
  const results = await Promise.all([
    store.claimApprovedTaskV1(claimRequest(common, "worker-A", "claim-A")),
    store.claimApprovedTaskV1(claimRequest(common, "worker-B", "claim-B")),
  ]);
  assert.equal(results.filter((result) => result.outcome === "claimed").length, 1);
  assert.equal(results.filter((result) => result.outcome === "not_available").length, 1);
  assert.equal(store.snapshotTask(common.taskId).status, "running");
});

test("idempotent claim replay returns the original lease without consuming twice", async () => {
  const { store, common } = createFixture();
  await issue(store, common);
  const request = claimRequest(common);
  const first = await store.claimApprovedTaskV1(request);
  const replay = await store.claimApprovedTaskV1(request);
  assert.deepEqual(replay, first);
  assert.equal(store.getEvents().filter((event) => event.type === "claimed").length, 1);
});

test("failed grant transaction leaves task, grant table, and events unchanged", async () => {
  const { store, common } = createFixture();
  store.failNextTransaction();
  await assert.rejects(issue(store, common));
  assert.equal(store.snapshotTask(common.taskId).status, "awaiting_approval");
  assert.equal(store.getGrantCount(), 0);
  assert.deepEqual(store.getEvents(), []);
});

test("failed claim transaction leaves approved task and grant retryable", async () => {
  const { store, common } = createFixture();
  await issue(store, common);
  store.failNextTransaction();
  await assert.rejects(store.claimApprovedTaskV1(claimRequest(common)));
  assert.equal(store.snapshotTask(common.taskId).status, "approved");
  assert.equal(store.getEvents().length, 1);
  const retry = await store.claimApprovedTaskV1(claimRequest(common));
  assert.equal(retry.outcome, "claimed");
});
