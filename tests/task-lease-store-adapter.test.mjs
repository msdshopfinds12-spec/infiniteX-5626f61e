import test from "node:test";
import assert from "node:assert/strict";
import { createLeaseFencedTaskStoreAdapter, TaskLeaseError } from "../server/integrations/task-lease-store-adapter.mjs";

const now = "2026-11-19T12:00:00.000Z";
const request = { taskId: "task_1", ownerId: "owner_1", expectedVersion: 4 };
const leaseId = "lease_identifier_123456";
const claimedRequest = { ...request, expectedVersion: 5 };
const snapshot = (overrides = {}) => ({
  id: "task_1", state: "running", version: 5,
  lease: { ownerId: "owner_1", leaseId, fencingToken: 7, expiresAt: "2026-11-19T12:00:30.000Z" },
  ...overrides,
});
const storeWith = (overrides = {}) => ({
  claimTaskWithLease: async () => snapshot(),
  renewTaskLease: async () => snapshot({ version: 6 }),
  completeTaskWithLease: async () => true,
  failTaskWithLease: async () => true,
  ...overrides,
});

test("claims a validated lease and passes a bounded duration to the atomic store method", async () => {
  let received;
  const adapter = createLeaseFencedTaskStoreAdapter({
    store: storeWith({ claimTaskWithLease: async (input) => { received = input; return snapshot(); } }),
    clock: () => now,
  });
  const claimed = await adapter.claim(request);
  assert.equal(claimed.lease.fencingToken, 7);
  assert.equal(received.leaseDurationMs, 30_000);
  assert.equal(Object.hasOwn(received, "now"), false);
  assert.equal(Object.isFrozen(claimed.lease), true);
});

test("returns null for an atomic claim conflict", async () => {
  const adapter = createLeaseFencedTaskStoreAdapter({ store: storeWith({ claimTaskWithLease: async () => null }), clock: () => now });
  assert.equal(await adapter.claim(request), null);
});

test("rejects a store snapshot with a wrong owner, stale version, or expired lease", async () => {
  for (const bad of [
    snapshot({ lease: { ...snapshot().lease, ownerId: "other" } }),
    snapshot({ version: 4 }),
    snapshot({ lease: { ...snapshot().lease, expiresAt: now } }),
  ]) {
    const adapter = createLeaseFencedTaskStoreAdapter({ store: storeWith({ claimTaskWithLease: async () => bad }), clock: () => now });
    await assert.rejects(adapter.claim(request), (error) => error.code === "INVALID_STORE_RESULT");
  }
});

test("renews only with the caller's fencing tuple and returns null for stale leases", async () => {
  let received;
  const adapter = createLeaseFencedTaskStoreAdapter({
    store: storeWith({ renewTaskLease: async (input) => { received = input; return snapshot({ version: 6 }); } }),
    clock: () => now,
  });
  const renewed = await adapter.renew({ ...claimedRequest, leaseId, fencingToken: 7 });
  assert.equal(renewed.version, 6);
  assert.equal(received.fencingToken, 7);
  const stale = createLeaseFencedTaskStoreAdapter({
    store: storeWith({ renewTaskLease: async () => null }), clock: () => now,
  });
  assert.equal(await stale.renew({ ...claimedRequest, leaseId, fencingToken: 6 }), null);
});

test("completion and failure require exact boolean results from atomic store methods", async () => {
  const adapter = createLeaseFencedTaskStoreAdapter({ store: storeWith(), clock: () => now });
  const lease = { ...request, leaseId, fencingToken: 7 };
  assert.equal(await adapter.complete(lease), true);
  assert.equal(await adapter.fail(lease), true);
  const malformed = createLeaseFencedTaskStoreAdapter({
    store: storeWith({ completeTaskWithLease: async () => 1 }), clock: () => now,
  });
  await assert.rejects(malformed.complete(lease), (error) => error.code === "INVALID_STORE_RESULT");
});

test("fails closed when a durable atomic operation is absent", async () => {
  const adapter = createLeaseFencedTaskStoreAdapter({ store: {}, clock: () => now });
  await assert.rejects(adapter.claim(request), (error) => error.code === "STORE_OPERATION_UNAVAILABLE");
});

test("validates lease tuple and clock before calling the store", async () => {
  const adapter = createLeaseFencedTaskStoreAdapter({ store: storeWith(), clock: () => now });
  await assert.rejects(adapter.complete({ ...request, leaseId: "short", fencingToken: 7 }), (error) => error.code === "INVALID_INPUT");
  const badClock = createLeaseFencedTaskStoreAdapter({ store: storeWith(), clock: () => "not-a-date" });
  await assert.rejects(badClock.claim(request), (error) => error.code === "INVALID_CLOCK");
  assert.throws(() => createLeaseFencedTaskStoreAdapter({ store: storeWith(), leaseDurationMs: 0 }), /leaseDurationMs/);
});

test("uses trusted adapter time and never forwards caller-controlled timestamps", async () => {
  let calls = 0;
  let received;
  const clock = () => {
    calls += 1;
    return calls === 1 ? now : "2026-11-19T12:00:01.000Z";
  };
  const adapter = createLeaseFencedTaskStoreAdapter({
    store: storeWith({
      renewTaskLease: async (input) => { received = input; return snapshot({ version: 6 }); },
    }),
    clock,
  });
  await adapter.renew({ ...claimedRequest, leaseId, fencingToken: 7 });
  assert.equal(calls, 1);
  assert.equal(Object.hasOwn(received, "now"), false);

  calls = 0;
  const settleAdapter = createLeaseFencedTaskStoreAdapter({
    store: storeWith({
      completeTaskWithLease: async (input) => { received = input; return true; },
    }),
    clock,
  });
  await settleAdapter.complete({ ...claimedRequest, leaseId, fencingToken: 7 });
  assert.equal(calls, 1);
  assert.equal(Object.hasOwn(received, "now"), false);
});

test("rejects renewal results that change the lease identity or fencing token", async () => {
  for (const lease of [
    { ...snapshot().lease, leaseId: "another_lease_identifier_123" },
    { ...snapshot().lease, fencingToken: 8 },
  ]) {
    const adapter = createLeaseFencedTaskStoreAdapter({
      store: storeWith({ renewTaskLease: async () => snapshot({ version: 6, lease }) }),
      clock: () => now,
    });
    await assert.rejects(
      adapter.renew({ ...claimedRequest, leaseId, fencingToken: 7 }),
      (error) => error.code === "INVALID_STORE_RESULT",
    );
  }
});


test("rejects malformed inputs and caller-supplied timestamps", async () => {
  const adapter = createLeaseFencedTaskStoreAdapter({ store: storeWith(), clock: () => now });
  await assert.rejects(adapter.renew(null), (error) => error.code === "INVALID_INPUT");
  await assert.rejects(adapter.complete(null), (error) => error.code === "INVALID_INPUT");
  await assert.rejects(
    adapter.renew({ ...claimedRequest, leaseId, fencingToken: 7, now: "2099-01-01T00:00:00.000Z" }),
    (error) => error.code === "UNTRUSTED_TIME_INPUT",
  );
  await assert.rejects(
    adapter.complete({ ...claimedRequest, leaseId, fencingToken: 7, now: "2000-01-01T00:00:00.000Z" }),
    (error) => error.code === "UNTRUSTED_TIME_INPUT",
  );
});
