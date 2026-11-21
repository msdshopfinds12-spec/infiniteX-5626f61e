import {
  classifyLeaseRpcError,
  isCanonicalUuid,
  LEASE_RPC,
  validateLease,
  WorkflowLeaseError,
  type LeaseIdentity,
  type LeaseTerminalStatus,
  type WorkflowLease,
} from "./workflow-lease-contract.ts";

export type RpcResponse = { data: unknown; error: unknown | null };
export type LeaseRpc = (name: string, args: Record<string, unknown>) => Promise<RpcResponse>;

function oneRow(data: unknown): Record<string, unknown> {
  const row = Array.isArray(data) ? (data.length === 1 ? data[0] : null) : data;
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new WorkflowLeaseError("LEASE_INVALID");
  }
  return row as Record<string, unknown>;
}
async function invoke(rpc: LeaseRpc, name: string, args: Record<string, unknown>): Promise<unknown> {
  if (typeof rpc !== "function") throw new WorkflowLeaseError("LEASE_INVALID");
  let result: RpcResponse;
  try {
    result = await rpc(name, args);
  } catch (error) {
    // A rejected promise is ambiguous: the database may have committed.
    throw new WorkflowLeaseError("LEASE_TRANSPORT_AMBIGUOUS", error);
  }
  if (!result || result.error !== null) throw classifyLeaseRpcError(result?.error);
  return result.data;
}

export async function claimWorkflowLeases(
  rpc: LeaseRpc,
  options: { ownerId: string; limit?: number; leaseSeconds?: number; runId?: string },
): Promise<WorkflowLease[]> {
  if (!isCanonicalUuid(options.ownerId) ||
      (options.runId !== undefined && !isCanonicalUuid(options.runId))) {
    throw new WorkflowLeaseError("LEASE_INVALID");
  }
  const limit = options.limit ?? 3;
  const leaseSeconds = options.leaseSeconds ?? 90;
  if (!Number.isInteger(limit) || limit < 1 || limit > 5 ||
      !Number.isInteger(leaseSeconds) || leaseSeconds < 30 || leaseSeconds > 900) {
    throw new WorkflowLeaseError("LEASE_INVALID");
  }
  const data = await invoke(rpc, LEASE_RPC.claim, {
    p_limit: limit,
    p_lease_seconds: leaseSeconds,
    p_run_id: options.runId ?? null,
    p_owner_id: options.ownerId,
  });
  if (!Array.isArray(data)) throw new WorkflowLeaseError("LEASE_INVALID");
  return data.map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new WorkflowLeaseError("LEASE_INVALID");
    }
    const item = row as Record<string, unknown>;
    return validateLease({
      runId: item.id,
      ownerId: item.owner_id,
      attempt: item.attempt,
      leaseToken: item.lease_token,
      leaseUntil: item.lease_until,
    });
  });
}

export async function heartbeatWorkflowLease(
  rpc: LeaseRpc,
  lease: LeaseIdentity,
  extendSeconds = 90,
): Promise<WorkflowLease> {
  if (!Number.isInteger(extendSeconds) || extendSeconds < 30 || extendSeconds > 900) {
    throw new WorkflowLeaseError("LEASE_INVALID");
  }
  const data = await invoke(rpc, LEASE_RPC.heartbeat, {
    p_run_id: lease.runId,
    p_owner_id: lease.ownerId,
    p_attempt: lease.attempt,
    p_lease_token: lease.leaseToken,
    p_extend_seconds: extendSeconds,
  });
  const row = oneRow(data);
  if (typeof row.lease_until !== "string" || !Number.isFinite(Date.parse(row.lease_until))) {
    throw new WorkflowLeaseError("LEASE_INVALID");
  }
  return validateLease({ ...lease, leaseUntil: row.lease_until });
}

export async function startWorkflowStepWithLease(
  rpc: LeaseRpc,
  lease: LeaseIdentity,
  stepId: string,
  input: Record<string, unknown> = {},
): Promise<{ stepRunId: string; replayed: boolean }> {
  if (!isCanonicalUuid(stepId) || !input || typeof input !== "object" || Array.isArray(input)) {
    throw new WorkflowLeaseError("LEASE_INVALID");
  }
  const data = await invoke(rpc, LEASE_RPC.startStep, {
    p_owner_id: lease.ownerId, p_run_id: lease.runId, p_step_id: stepId,
    p_attempt: lease.attempt, p_lease_token: lease.leaseToken, p_input: input,
  });
  const row = oneRow(data);
  if (!isCanonicalUuid(row.step_run_id) || typeof row.replayed !== "boolean") {
    throw new WorkflowLeaseError("LEASE_INVALID");
  }
  return { stepRunId: row.step_run_id, replayed: row.replayed };
}

export async function failWorkflowStepWithLease(
  rpc: LeaseRpc,
  lease: LeaseIdentity,
  stepId: string,
  error: string,
): Promise<{ stepRunId: string }> {
  if (!isCanonicalUuid(stepId) || typeof error !== "string" || error.length < 1 || error.length > 500) {
    throw new WorkflowLeaseError("LEASE_INVALID");
  }
  const data = await invoke(rpc, LEASE_RPC.failStep, {
    p_owner_id: lease.ownerId, p_run_id: lease.runId, p_step_id: stepId,
    p_attempt: lease.attempt, p_lease_token: lease.leaseToken, p_error: error,
  });
  const row = oneRow(data);
  if (!isCanonicalUuid(row.step_run_id)) throw new WorkflowLeaseError("LEASE_INVALID");
  return { stepRunId: row.step_run_id };
}

export async function completeWorkflowStepWithLease(
  rpc: LeaseRpc,
  lease: LeaseIdentity,
  stepId: string,
  output: Record<string, unknown>,
  outbox?: { eventType: string; idempotencyKey: string; payload: Record<string, unknown> },
): Promise<{ stepRunId: string; outboxId: string | null; replayed: boolean }> {
  if (!isCanonicalUuid(stepId) || !output || typeof output !== "object" || Array.isArray(output)) {
    throw new WorkflowLeaseError("LEASE_INVALID");
  }
  const data = await invoke(rpc, LEASE_RPC.completeStep, {
    p_owner_id: lease.ownerId, p_run_id: lease.runId, p_step_id: stepId,
    p_attempt: lease.attempt, p_lease_token: lease.leaseToken, p_output: output,
    p_event_type: outbox?.eventType ?? null,
    p_idempotency_key: outbox?.idempotencyKey ?? null,
    p_payload: outbox?.payload ?? {},
  });
  const row = oneRow(data);
  if (!isCanonicalUuid(row.step_run_id) ||
      !(row.outbox_id === null || isCanonicalUuid(row.outbox_id)) ||
      typeof row.replayed !== "boolean") throw new WorkflowLeaseError("LEASE_INVALID");
  return { stepRunId: row.step_run_id, outboxId: row.outbox_id as string | null, replayed: row.replayed };
}

export async function finishWorkflowRunWithLease(
  rpc: LeaseRpc,
  lease: LeaseIdentity,
  status: LeaseTerminalStatus,
  output?: Record<string, unknown>,
  error?: string,
): Promise<{ id: string; status: LeaseTerminalStatus; attempt: number }> {
  if (output !== undefined && (!output || typeof output !== "object" || Array.isArray(output))) {
    throw new WorkflowLeaseError("LEASE_INVALID");
  }
  if (error !== undefined && (typeof error !== "string" || error.length > 500)) {
    throw new WorkflowLeaseError("LEASE_INVALID");
  }
  const data = await invoke(rpc, LEASE_RPC.finishRun, {
    p_run_id: lease.runId, p_owner_id: lease.ownerId, p_attempt: lease.attempt,
    p_lease_token: lease.leaseToken, p_terminal_status: status,
    p_output: output ?? null, p_error: error ?? null,
  });
  const row = oneRow(data);
  if (row.id !== lease.runId || row.status !== status || row.attempt !== lease.attempt) {
    throw new WorkflowLeaseError("LEASE_INVALID");
  }
  return { id: lease.runId, status, attempt: lease.attempt };
}
