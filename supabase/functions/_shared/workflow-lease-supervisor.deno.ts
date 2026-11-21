import {
  WorkflowLeaseError,
  type WorkflowLease,
} from "./workflow-lease-contract.ts";
import { WorkflowLeaseSupervisor, type Scheduler } from "./workflow-lease-supervisor.ts";

const lease: WorkflowLease = Object.freeze({
  runId: "11111111-1111-4111-8111-111111111111",
  ownerId: "22222222-2222-4222-8222-222222222222",
  attempt: 1,
  leaseToken: "33333333-3333-4333-8333-333333333333",
  leaseUntil: "2030-01-01T00:00:00.000Z",
});
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
function fakeScheduler() {
  let callback: (() => void) | null = null;
  let cleared = false;
  const scheduler: Scheduler = {
    setTimeout(fn) { callback = fn; return 1; },
    clearTimeout() { cleared = true; callback = null; },
  };
  return { scheduler, fire() { const fn = callback; callback = null; fn?.(); }, get cleared() { return cleared; } };
}

Deno.test("supervisor renews with the same fenced identity and updates expiry", async () => {
  let calls = 0;
  const supervisor = new WorkflowLeaseSupervisor({
    lease, leaseDurationSeconds: 90, heartbeatIntervalMs: 10_000,
    heartbeat: async (identity) => {
      calls++;
      assert(identity.leaseToken === lease.leaseToken, "token identity must not rotate locally");
      return { ...lease, leaseUntil: "2030-01-01T00:02:00.000Z" };
    },
  });
  await supervisor.heartbeatNow();
  assert(calls === 1, "heartbeat called once");
  assert(supervisor.lease.leaseUntil === "2030-01-01T00:02:00.000Z", "expiry updated");
  await supervisor.release();
});

Deno.test("single-flight heartbeat shares one in-flight request", async () => {
  const gate = deferred<WorkflowLease>();
  let calls = 0;
  const supervisor = new WorkflowLeaseSupervisor({
    lease, heartbeat: async () => { calls++; return await gate.promise; },
  });
  const a = supervisor.heartbeatNow();
  const b = supervisor.heartbeatNow();
  assert(calls === 1, "only one renewal may be in flight");
  gate.resolve({ ...lease, leaseUntil: "2030-01-01T00:03:00.000Z" });
  await Promise.all([a, b]);
  await supervisor.release();
});

Deno.test("lease rejection aborts work and makes supervisor terminal", async () => {
  let observed: WorkflowLeaseError | undefined;
  const supervisor = new WorkflowLeaseSupervisor({
    lease, heartbeat: async () => { throw new WorkflowLeaseError("LEASE_LOST"); },
    onLeaseLost: error => { observed = error; },
  });
  let rejected = false;
  try { await supervisor.heartbeatNow(); } catch { rejected = true; }
  assert(rejected && supervisor.signal.aborted && supervisor.isTerminal, "lost lease aborts work");
  assert(observed?.code === "LEASE_LOST", "loss reason surfaced");
  await supervisor.release();
});

Deno.test("transport ambiguity fails closed and never silently retries", async () => {
  let calls = 0;
  const supervisor = new WorkflowLeaseSupervisor({
    lease, heartbeat: async () => { calls++; throw new Error("connection reset"); },
  });
  try { await supervisor.heartbeatNow(); } catch (error) {
    assert(error instanceof WorkflowLeaseError && error.code === "LEASE_TRANSPORT_AMBIGUOUS", "ambiguous code");
  }
  assert(calls === 1 && supervisor.isTerminal && supervisor.signal.aborted, "no blind retry");
});

Deno.test("late heartbeat response cannot revive a released supervisor", async () => {
  const gate = deferred<WorkflowLease>();
  const supervisor = new WorkflowLeaseSupervisor({ lease, heartbeat: () => gate.promise });
  const pending = supervisor.heartbeatNow();
  await supervisor.release(); // must not wait for an unresponsive network request
  gate.resolve({ ...lease, leaseUntil: "2030-01-01T00:04:00.000Z" });
  await pending;
  assert(supervisor.isTerminal, "release stays terminal");
  assert(supervisor.lease.leaseUntil === lease.leaseUntil, "late response cannot update expiry");
});

Deno.test("repeated release is idempotent and clears scheduled heartbeat", async () => {
  const fake = fakeScheduler();
  const supervisor = new WorkflowLeaseSupervisor({ lease, heartbeat: async () => lease, scheduler: fake.scheduler });
  supervisor.start();
  await supervisor.release();
  await supervisor.release();
  assert(supervisor.isTerminal && fake.cleared, "timer cleared once and release safe");
});

Deno.test("invalid heartbeat identity cannot be accepted", async () => {
  const supervisor = new WorkflowLeaseSupervisor({
    lease, heartbeat: async () => ({ ...lease, attempt: 2 }),
  });
  let rejected = false;
  try { await supervisor.heartbeatNow(); } catch { rejected = true; }
  assert(rejected && supervisor.isTerminal, "identity mutation rejected");
});

Deno.test("stalled heartbeat transport times out and aborts the work signal", async () => {
  const fake = fakeScheduler();
  const supervisor = new WorkflowLeaseSupervisor({
    lease,
    heartbeatIntervalMs: 10_000,
    heartbeatTimeoutMs: 1_000,
    scheduler: fake.scheduler,
    heartbeat: () => new Promise<WorkflowLease>(() => undefined),
  });
  const pending = supervisor.heartbeatNow();
  fake.fire();
  let code = "";
  try { await pending; } catch (error) {
    if (error instanceof WorkflowLeaseError) code = error.code;
  }
  assert(code === "LEASE_TRANSPORT_AMBIGUOUS", "timeout classified as ambiguous");
  assert(supervisor.signal.aborted && supervisor.isTerminal, "hung heartbeat aborts work");
});
