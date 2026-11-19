import test from "node:test";
import assert from "node:assert/strict";
import {
  createApprovalProtocolAdapter,
  ApprovalProtocolError,
} from "../server/ai/approval-protocol-adapter.mjs";

const principal = Object.freeze({ subject: "verified-user-1" });
const worker = Object.freeze({ subject: "verified-worker-1" });
const common = {
  taskId: "task-1",
  taskVersion: "12",
  payloadHash: "a".repeat(64),
  approvalTokenDigest: "9".repeat(64),
  agentId: "agent-safe",
  agentVersion: "2.0.0",
  capabilityId: "text.metrics",
  capabilityVersion: "1.0.0",
  principal,
  idempotencyKey: "approval-req-001",
};
const approvedTask = () => ({ id: "task-1", status: "approved", version: 13 });
const runningTask = () => ({ id: "task-1", status: "running", version: 14 });
function createAdapter({ store }) {
  return createApprovalProtocolAdapter({
    store,
    resolvePrincipalSubject: (identity) => {
      if (identity !== principal) throw new Error("untrusted principal");
      return principal.subject;
    },
    resolveWorkerSubject: (identity) => {
      if (identity !== worker) throw new Error("untrusted worker");
      return worker.subject;
    },
  });
}

const lease = () => ({
  leaseId: "lease-001",
  workerSubject: worker.subject,
  fencingToken: 8,
  expiresAt: "2026-11-20T12:00:00.000Z",
});

test("requires durable operations and trusted identity resolvers", () => {
  assert.throws(() => createApprovalProtocolAdapter({ store: {} }), TypeError);
  assert.throws(() => createApprovalProtocolAdapter({
    store: { approveTaskWithGrantV1() {}, claimApprovedTaskV1() {} },
  }), TypeError);
  assert.throws(() => createAdapter({ store: {} }), TypeError);
  assert.throws(() => createAdapter({
    store: { approveTaskWithGrantV1() {} },
  }), TypeError);
});


test("rejects caller-supplied identity objects not recognized by trusted resolvers", async () => {
  let calls = 0;
  const adapter = createAdapter({
    store: {
      approveTaskWithGrantV1: async () => { calls += 1; return { outcome: "conflict" }; },
      claimApprovedTaskV1: async () => { calls += 1; return { outcome: "not_available" }; },
    },
  });
  await assert.rejects(
    adapter.approveTaskWithGrantV1({
      ...common,
      principal: { subject: "verified-user-1" },
      approvalTokenDigest: "f".repeat(64),
    }),
    (error) => error.code === "UNTRUSTED_PRINCIPAL_SUBJECT",
  );
  await assert.rejects(
    adapter.claimApprovedTaskV1({
      ...common,
      principal: { subject: "verified-user-1" },
      worker,
      leaseDurationMs: 60_000,
      idempotencyKey: "claim-spoofed-principal",
    }),
    (error) => error.code === "UNTRUSTED_PRINCIPAL_SUBJECT",
  );
  await assert.rejects(
    adapter.claimApprovedTaskV1({
      ...common,
      worker: { subject: "verified-worker-1" },
      leaseDurationMs: 60_000,
      idempotencyKey: "claim-spoofed-worker",
    }),
    (error) => error.code === "UNTRUSTED_WORKER_SUBJECT",
  );
  assert.equal(calls, 0);
});

test("approval passes only validated, owner-scoped digests and idempotency metadata", async () => {
  let received;
  const adapter = createAdapter({
    store: {
      approveTaskWithGrantV1: async (request) => {
        received = request;
        return { outcome: "approved", task: approvedTask() };
      },
      claimApprovedTaskV1: async () => ({ outcome: "not_available" }),
    },
  });
  const result = await adapter.approveTaskWithGrantV1({
    ...common,
    approvalTokenDigest: "b".repeat(64),
  });
  assert.equal(result.outcome, "approved");
  assert.equal(result.task.status, "approved");
  assert.equal(received.principalSubject, principal.subject);
  assert.equal(received.approvalTokenDigest, "b".repeat(64));
  assert.equal(received.idempotencyKey, common.idempotencyKey);
  assert.equal("approvalToken" in received, false);
  assert.equal("token" in received, false);
  assert.equal(Object.isFrozen(received), true);
});

test("rejects malformed approval digests before calling the driver", async () => {
  let calls = 0;
  const adapter = createAdapter({
    store: {
      approveTaskWithGrantV1: async () => { calls += 1; return { outcome: "conflict" }; },
      claimApprovedTaskV1: async () => ({ outcome: "not_available" }),
    },
  });
  await assert.rejects(
    adapter.approveTaskWithGrantV1({ ...common, approvalTokenDigest: "not-a-digest" }),
    (error) => error instanceof ApprovalProtocolError && error.code === "INVALID_APPROVAL_TOKEN_DIGEST",
  );
  assert.equal(calls, 0);
});

test("maps approved conflicts and invalid grants to stable outcomes", async () => {
  for (const outcome of ["conflict", "approval_invalid", "not_available"]) {
    const adapter = createAdapter({
      store: {
        approveTaskWithGrantV1: async () => ({ outcome }),
        claimApprovedTaskV1: async () => ({ outcome: "not_available" }),
      },
    });
    assert.deepEqual(await adapter.approveTaskWithGrantV1({
      ...common, approvalTokenDigest: "c".repeat(64),
    }), { outcome });
  }
});

test("rejects a driver claiming approval without the approved state", async () => {
  const adapter = createAdapter({
    store: {
      approveTaskWithGrantV1: async () => ({ outcome: "approved", task: { status: "running" } }),
      claimApprovedTaskV1: async () => ({ outcome: "not_available" }),
    },
  });
  await assert.rejects(
    adapter.approveTaskWithGrantV1({ ...common, approvalTokenDigest: "d".repeat(64) }),
    (error) => error.code === "INVALID_STORE_RESULT",
  );
});

test("worker claim requires authenticated worker identity and bounded lease duration", async () => {
  let received;
  const adapter = createAdapter({
    store: {
      approveTaskWithGrantV1: async () => ({ outcome: "conflict" }),
      claimApprovedTaskV1: async (request) => {
        received = request;
        return { outcome: "claimed", task: runningTask(), lease: lease() };
      },
    },
  });
  const result = await adapter.claimApprovedTaskV1({
    ...common,
    worker,
    leaseDurationMs: 60_000,
    idempotencyKey: "worker-claim-001",
  });
  assert.equal(result.outcome, "claimed");
  assert.equal(result.task.status, "running");
  assert.equal(result.lease.fencingToken, 8);
  assert.equal(received.workerSubject, worker.subject);
  assert.equal(received.approvalTokenDigest, common.approvalTokenDigest);
  assert.equal(received.leaseDurationMs, 60_000);
  assert.equal(Object.isFrozen(result.lease), true);
});

test("rejects missing, invalid, or out-of-range lease durations before driver call", async () => {
  let calls = 0;
  const adapter = createAdapter({
    store: {
      approveTaskWithGrantV1: async () => ({ outcome: "conflict" }),
      claimApprovedTaskV1: async () => { calls += 1; return { outcome: "not_available" }; },
    },
  });
  for (const leaseDurationMs of [undefined, 0, 999, 900001, 1.5, NaN]) {
    await assert.rejects(
      adapter.claimApprovedTaskV1({ ...common, worker, leaseDurationMs, idempotencyKey: "claim-001" }),
      (error) => error.code === "INVALID_LEASE_DURATION",
    );
  }
  assert.equal(calls, 0);
});

test("rejects incomplete or mismatched lease tuples and never reports a successful claim", async () => {
  const invalidLeases = [
    { ...lease(), fencingToken: 0 },
    { ...lease(), fencingToken: Number.MAX_SAFE_INTEGER + 1 },
    { ...lease(), expiresAt: "not-a-date" },
    { ...lease(), workerSubject: "attacker-worker" },
    { ...lease(), leaseId: "" },
  ];
  for (const invalidLease of invalidLeases) {
    const adapter = createAdapter({
      store: {
        approveTaskWithGrantV1: async () => ({ outcome: "conflict" }),
        claimApprovedTaskV1: async () => ({
          outcome: "claimed", task: runningTask(), lease: invalidLease,
        }),
      },
    });
    await assert.rejects(
      adapter.claimApprovedTaskV1({
        ...common, worker, leaseDurationMs: 60_000, idempotencyKey: "claim-002",
      }),
      (error) => error.code === "INVALID_STORE_RESULT",
    );
  }
});

test("rejects claimed outcome without running task state or lease", async () => {
  for (const result of [
    { outcome: "claimed", task: { status: "approved" }, lease: lease() },
    { outcome: "claimed", task: runningTask() },
    { outcome: "unknown" },
    null,
  ]) {
    const adapter = createAdapter({
      store: {
        approveTaskWithGrantV1: async () => ({ outcome: "conflict" }),
        claimApprovedTaskV1: async () => result,
      },
    });
    await assert.rejects(
      adapter.claimApprovedTaskV1({
        ...common, worker, leaseDurationMs: 60_000, idempotencyKey: "claim-003",
      }),
      (error) => error.code === "INVALID_STORE_RESULT",
    );
  }
});

test("normalizes durable driver errors without leaking internal messages", async () => {
  const adapter = createAdapter({
    store: {
      approveTaskWithGrantV1: async () => { throw new Error("private SQL details"); },
      claimApprovedTaskV1: async () => { throw new Error("private worker store details"); },
    },
  });
  await assert.rejects(
    adapter.approveTaskWithGrantV1({ ...common, approvalTokenDigest: "e".repeat(64) }),
    (error) => error.code === "APPROVAL_STORE_UNAVAILABLE" && !error.message.includes("private"),
  );
  await assert.rejects(
    adapter.claimApprovedTaskV1({
      ...common, worker, leaseDurationMs: 60_000, idempotencyKey: "claim-004",
    }),
    (error) => error.code === "CLAIM_STORE_UNAVAILABLE" && !error.message.includes("private"),
  );
});
