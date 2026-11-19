import test from "node:test";
import assert from "node:assert/strict";
import { createApprovalProtocolAdapter } from "../server/ai/approval-protocol-adapter.mjs";
import { createFakeTwoStageApprovalStore } from "./helpers/fake-two-stage-approval-store.mjs";

const principal = Object.freeze({ auth: "trusted-principal" });
const worker = Object.freeze({ auth: "trusted-worker" });
const initialTime = 1_800_000_000_000;

function fixture(taskId = "lifecycle-task") {
  const store = createFakeTwoStageApprovalStore({ now: () => initialTime });
  store.seedTask({
    taskId, status: "awaiting_approval", ownerSubject: "owner-1",
    taskVersion: "v1", payloadHash: "a".repeat(64), agentId: "agent-1",
    agentVersion: "1.0.0", capabilityId: "task.run", capabilityVersion: "1.0.0",
    version: 1,
  });
  const adapter = createApprovalProtocolAdapter({
    store,
    resolvePrincipalSubject: (value) => value === principal ? "owner-1" : (() => { throw new Error("untrusted"); })(),
    resolveWorkerSubject: (value) => value === worker ? "worker-1" : (() => { throw new Error("untrusted"); })(),
  });
  const base = {
    taskId, taskVersion: "v1", payloadHash: "a".repeat(64), agentId: "agent-1",
    agentVersion: "1.0.0", capabilityId: "task.run", capabilityVersion: "1.0.0",
    approvalTokenDigest: "b".repeat(64), principal, idempotencyKey: "grant-1",
  };
  return { store, adapter, base };
}

async function claim(f) {
  await f.adapter.issueApprovalGrantV1({ ...f.base, ttlMs: 60_000 });
  return f.adapter.claimApprovedTaskV1({
    ...f.base, worker, leaseDurationMs: 30_000, idempotencyKey: "claim-1",
  });
}

test("lease renewal is worker-bound, versioned, and idempotently replayable", async () => {
  const f = fixture();
  const claimed = await claim(f);
  const request = {
    taskId: f.base.taskId, principal, worker, leaseId: claimed.lease.leaseId,
    fencingToken: claimed.lease.fencingToken, expectedTaskVersion: claimed.task.version,
    leaseDurationMs: 45_000, idempotencyKey: "renew-1",
  };
  const first = await f.adapter.renewExecutionLeaseV1(request);
  const replay = await f.adapter.renewExecutionLeaseV1(request);
  assert.equal(first.outcome, "renewed");
  assert.equal(first.task.version, claimed.task.version + 1);
  assert.deepEqual(replay, first);
  assert.equal(f.store.getEvents().filter((event) => event.type === "lease_renewed").length, 1);
});

test("expired lease cannot be renewed or settled", async () => {
  const f = fixture();
  const claimed = await claim(f);
  f.store.advanceTime(30_000);
  const common = {
    taskId: f.base.taskId, principal, worker, leaseId: claimed.lease.leaseId,
    fencingToken: claimed.lease.fencingToken, expectedTaskVersion: claimed.task.version,
  };
  assert.deepEqual(await f.adapter.renewExecutionLeaseV1({
    ...common, leaseDurationMs: 30_000, idempotencyKey: "renew-expired",
  }), { outcome: "lease_expired" });
  assert.deepEqual(await f.adapter.settleExecutionV1({
    ...common, targetStatus: "succeeded", idempotencyKey: "settle-expired",
  }), { outcome: "lease_expired" });
  assert.equal(f.store.snapshotTask(f.base.taskId).status, "running");
});

test("settlement is terminal, lease-bound, and idempotent", async () => {
  const f = fixture();
  const claimed = await claim(f);
  const request = {
    taskId: f.base.taskId, principal, worker, leaseId: claimed.lease.leaseId,
    fencingToken: claimed.lease.fencingToken, expectedTaskVersion: claimed.task.version,
    targetStatus: "succeeded", resultDigest: "c".repeat(64), idempotencyKey: "settle-1",
  };
  const first = await f.adapter.settleExecutionV1(request);
  const replay = await f.adapter.settleExecutionV1(request);
  assert.equal(first.outcome, "settled");
  assert.equal(first.task.status, "succeeded");
  assert.deepEqual(replay, first);
  assert.equal(f.store.getEvents().filter((event) => event.type === "succeeded").length, 1);
});

test("owner cancellation invalidates the active lease and fences the former worker", async () => {
  const f = fixture();
  const claimed = await claim(f);
  const cancelled = await f.adapter.cancelApprovedOrRunningTaskV1({
    taskId: f.base.taskId, principal, expectedTaskVersion: claimed.task.version,
    idempotencyKey: "cancel-1",
  });
  assert.equal(cancelled.outcome, "cancelled");
  assert.equal(cancelled.task.status, "cancelled");
  const staleSettlement = await f.adapter.settleExecutionV1({
    taskId: f.base.taskId, principal, worker, leaseId: claimed.lease.leaseId,
    fencingToken: claimed.lease.fencingToken, expectedTaskVersion: claimed.task.version,
    targetStatus: "succeeded", idempotencyKey: "stale-settle",
  });
  assert.deepEqual(staleSettlement, { outcome: "stale_fence" });
  assert.equal(f.store.snapshotTask(f.base.taskId).status, "cancelled");
});

test("transaction failure leaves lease renewal state and event history unchanged", async () => {
  const f = fixture();
  const claimed = await claim(f);
  const beforeEvents = f.store.getEvents();
  f.store.failNextTransaction();
  await assert.rejects(f.adapter.renewExecutionLeaseV1({
    taskId: f.base.taskId, principal, worker, leaseId: claimed.lease.leaseId,
    fencingToken: claimed.lease.fencingToken, expectedTaskVersion: claimed.task.version,
    leaseDurationMs: 30_000, idempotencyKey: "renew-rollback",
  }), (error) => error.code === "LEASE_RENEWAL_STORE_UNAVAILABLE");
  assert.deepEqual(f.store.getEvents(), beforeEvents);
  assert.equal(f.store.snapshotTask(f.base.taskId).version, claimed.task.version);
});

test("rejects unsafe versions, untrusted workers, and invalid settlement targets before mutation", async () => {
  const f = fixture();
  const claimed = await claim(f);
  const common = {
    taskId: f.base.taskId, principal, worker, leaseId: claimed.lease.leaseId,
    fencingToken: claimed.lease.fencingToken, expectedTaskVersion: claimed.task.version,
  };
  await assert.rejects(f.adapter.renewExecutionLeaseV1({
    ...common, fencingToken: Number.MAX_SAFE_INTEGER + 1, leaseDurationMs: 30_000, idempotencyKey: "bad-fence",
  }), (error) => error.code === "INVALID_EXPECTED_TASK_VERSION");
  await assert.rejects(f.adapter.settleExecutionV1({
    ...common, worker: { auth: "forged" }, targetStatus: "succeeded", idempotencyKey: "bad-worker",
  }), (error) => error.code === "UNTRUSTED_WORKER_SUBJECT");
  await assert.rejects(f.adapter.settleExecutionV1({
    ...common, targetStatus: "running", idempotencyKey: "bad-status",
  }), (error) => error.code === "INVALID_SETTLEMENT_STATUS");
  assert.equal(f.store.snapshotTask(f.base.taskId).status, "running");
});
