import {
  claimWorkflowLeases,
  heartbeatWorkflowLease,
  finishWorkflowRunWithLease,
  type LeaseRpc,
} from "./workflow-lease-rpc.ts";
import { WorkflowLeaseError } from "./workflow-lease-contract.ts";

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
