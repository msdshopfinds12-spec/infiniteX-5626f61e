import {
  claimWorkflowLeases,
  heartbeatWorkflowLease,
  finishWorkflowRunWithLease,
  completeWorkflowStepWithLease,
  startWorkflowStepWithLease,
  failWorkflowStepWithLease,
  type LeaseRpc,
} from "./workflow-lease-rpc.ts";
import { WorkflowLeaseError } from "./workflow-lease-contract.ts";
import { createWorkflowStepCompletedEvent } from "./workflow-outbox-contract.ts";

const leaseRow = {
  id: "11111111-1111-4111-8111-111111111111",
  workflow_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  owner_id: "22222222-2222-4222-8222-222222222222",
  attempt: 2,
  lease_token: "33333333-3333-4333-8333-333333333333",
  lease_until: "2030-01-01T00:00:00.000Z",
};
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

Deno.test("claim adapter validates and maps owner-scoped database lease rows", async () => {
  let captured: Record<string, unknown> | undefined;
  const rpc: LeaseRpc = async (name, args) => {
    assert(name === "simula_claim_workflow_runs_lease_internal", "claim RPC name");
    captured = args;
    return { data: [leaseRow], error: null };
  };
  const leases = await claimWorkflowLeases(rpc, { ownerId: leaseRow.owner_id, limit: 2, leaseSeconds: 60 });
  assert(leases.length === 1 && leases[0].runId === leaseRow.id && leases[0].attempt === 2, "lease mapped");
  assert(captured?.p_owner_id === leaseRow.owner_id && captured.p_limit === 2, "owner scope sent");
  assert(!Object.prototype.hasOwnProperty.call(captured, "p_run_id"),
    "absent optional UUID filter must be omitted so PostgREST uses DEFAULT NULL");
});

Deno.test("claim adapter rejects malformed database rows", async () => {
  const rpc: LeaseRpc = async () => ({ data: [{ ...leaseRow, lease_token: "not-a-uuid" }], error: null });
  let rejected = false;
  try { await claimWorkflowLeases(rpc, { ownerId: leaseRow.owner_id }); } catch (error) {
    rejected = error instanceof WorkflowLeaseError && error.code === "LEASE_INVALID";
  }
  assert(rejected, "malformed lease rejected");
});

Deno.test("heartbeat adapter preserves lease identity and validates expiry response", async () => {
  const rpc: LeaseRpc = async (name, args) => {
    assert(name === "simula_heartbeat_workflow_run", "heartbeat RPC name");
    assert(args.p_lease_token === leaseRow.lease_token && args.p_attempt === 2, "identity fenced");
    return { data: [{ lease_until: "2030-01-01T00:02:00.000Z", heartbeat_at: "2030-01-01T00:00:30.000Z" }], error: null };
  };
  const result = await heartbeatWorkflowLease(rpc, {
    runId: leaseRow.id, ownerId: leaseRow.owner_id, attempt: 2, leaseToken: leaseRow.lease_token,
  }, 60);
  assert(result.leaseUntil === "2030-01-01T00:02:00.000Z" && result.leaseToken === leaseRow.lease_token, "renewal parsed");
});

Deno.test("finish adapter rejects mismatched generation response", async () => {
  const rpc: LeaseRpc = async () => ({
    data: [{ id: leaseRow.id, status: "succeeded", attempt: 1 }], error: null,
  });
  let rejected = false;
  try {
    await finishWorkflowRunWithLease(rpc, {
      runId: leaseRow.id, ownerId: leaseRow.owner_id, attempt: 2, leaseToken: leaseRow.lease_token,
    }, "succeeded", {});
  } catch (error) { rejected = error instanceof WorkflowLeaseError; }
  assert(rejected, "generation mismatch rejected");
});

Deno.test("transport rejection is classified as ambiguous rather than retried", async () => {
  let calls = 0;
  const rpc: LeaseRpc = async () => { calls++; throw new Error("socket closed"); };
  let code = "";
  try { await heartbeatWorkflowLease(rpc, {
    runId: leaseRow.id, ownerId: leaseRow.owner_id, attempt: 2, leaseToken: leaseRow.lease_token,
  }); } catch (error) {
    if (error instanceof WorkflowLeaseError) code = error.code;
  }
  assert(calls === 1 && code === "LEASE_TRANSPORT_AMBIGUOUS", "ambiguous outcome surfaced once");
});

Deno.test("completion adapter rejects an outbox identity mismatch before RPC", async () => {
  let calls = 0;
  const rpc: LeaseRpc = async () => { calls++; return { data: [], error: null }; };
  const event = createWorkflowStepCompletedEvent({
    runId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    stepId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    attempt: 2,
  });
  let rejected = false;
  try {
    await completeWorkflowStepWithLease(rpc, {
      runId: leaseRow.id, ownerId: leaseRow.owner_id, attempt: 2, leaseToken: leaseRow.lease_token,
    }, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", {}, event);
  } catch (error) { rejected = error instanceof WorkflowLeaseError && error.code === "LEASE_INVALID"; }
  assert(rejected && calls === 0, "mismatched event cannot reach database");
});

Deno.test("start and fail step adapters send complete fenced identity", async () => {
  const names: string[] = [];
  const rpc: LeaseRpc = async (name, args) => {
    names.push(name);
    assert(args.p_run_id === leaseRow.id && args.p_owner_id === leaseRow.owner_id, "owner/run identity");
    assert(args.p_attempt === 2 && args.p_lease_token === leaseRow.lease_token, "attempt/token fence");
    assert(args.p_step_id === "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "step identity");
    if (name === "simula_start_workflow_step_with_lease") {
      assert(args.p_input !== undefined, "step input forwarded");
      return { data: [{ step_run_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", replayed: false }], error: null };
    }
    assert(name === "simula_fail_workflow_step_with_lease" && args.p_error === "synthetic failure", "failure payload");
    return { data: [{ step_run_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }], error: null };
  };
  const identity = { runId: leaseRow.id, ownerId: leaseRow.owner_id, attempt: 2, leaseToken: leaseRow.lease_token };
  await startWorkflowStepWithLease(rpc, identity, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", { safe: true });
  await failWorkflowStepWithLease(rpc, identity, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "synthetic failure");
  assert(names.join(",") === "simula_start_workflow_step_with_lease,simula_fail_workflow_step_with_lease", "correct RPCs");
});

Deno.test("finish adapter sends the exact database terminal contract", async () => {
  const rpc: LeaseRpc = async (name, args) => {
    assert(name === "simula_finish_workflow_run_lease", "finish RPC name");
    assert(args.p_run_id === leaseRow.id && args.p_owner_id === leaseRow.owner_id, "run owner");
    assert(args.p_attempt === 2 && args.p_lease_token === leaseRow.lease_token, "generation fence");
    assert(args.p_terminal_status === "failed" && args.p_error === "synthetic failure", "terminal status and error");
    return { data: [{ id: leaseRow.id, status: "failed", attempt: 2 }], error: null };
  };
  await finishWorkflowRunWithLease(rpc, {
    runId: leaseRow.id, ownerId: leaseRow.owner_id, attempt: 2, leaseToken: leaseRow.lease_token,
  }, "failed", undefined, "synthetic failure");
});
