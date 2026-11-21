/** Shared, runtime-validated workflow lease contracts. Database remains authoritative. */
export const LEASE_RPC = {
  claim: "simula_claim_workflow_runs_lease_internal",
  heartbeat: "simula_heartbeat_workflow_run",
  startStep: "simula_start_workflow_step_with_lease",
  failStep: "simula_fail_workflow_step_with_lease",
  completeStep: "simula_complete_step_with_outbox_lease",
  finishRun: "simula_finish_workflow_run_lease",
} as const;

export type WorkflowLease = Readonly<{
  runId: string;
  ownerId: string;
  attempt: number;
  leaseToken: string;
  leaseUntil: string;
}>;

export type LeaseIdentity = Pick<WorkflowLease, "runId" | "ownerId" | "attempt" | "leaseToken">;
export type LeaseTerminalStatus = "succeeded" | "failed" | "cancelled";

export type LeaseErrorCode =
  | "LEASE_REJECTED"
  | "LEASE_EXPIRED"
  | "LEASE_LOST"
  | "LEASE_TRANSPORT_AMBIGUOUS"
  | "LEASE_CANCELLED"
  | "LEASE_INVALID"
  | "LEASE_DATABASE_ERROR";

export class WorkflowLeaseError extends Error {
  readonly code: LeaseErrorCode;
  readonly causeValue?: unknown;
  constructor(code: LeaseErrorCode, causeValue?: unknown) {
    super(code);
    this.name = "WorkflowLeaseError";
    this.code = code;
    this.causeValue = causeValue;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PG_INTEGER_MAX = 2_147_483_647;

export function isCanonicalUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

export function validateLease(value: unknown): WorkflowLease {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new WorkflowLeaseError("LEASE_INVALID");
  }
  const row = value as Record<string, unknown>;
  if (!isCanonicalUuid(row.runId) ||
      !isCanonicalUuid(row.ownerId) ||
      !Number.isSafeInteger(row.attempt) ||
      (row.attempt as number) < 1 ||
      (row.attempt as number) > PG_INTEGER_MAX ||
      !isCanonicalUuid(row.leaseToken) ||
      typeof row.leaseUntil !== "string" ||
      !Number.isFinite(Date.parse(row.leaseUntil))) {
    throw new WorkflowLeaseError("LEASE_INVALID");
  }
  return Object.freeze({
    runId: row.runId,
    ownerId: row.ownerId,
    attempt: row.attempt as number,
    leaseToken: row.leaseToken,
    leaseUntil: new Date(row.leaseUntil).toISOString(),
  });
}

export function leaseRpcArgs(identity: LeaseIdentity): Record<string, unknown> {
  const lease = validateLease({ ...identity, leaseUntil: new Date().toISOString() });
  return {
    p_run_id: lease.runId,
    p_owner_id: lease.ownerId,
    p_attempt: lease.attempt,
    p_lease_token: lease.leaseToken,
  };
}

export function classifyLeaseRpcError(error: unknown): WorkflowLeaseError {
  const message = error && typeof error === "object" && "message" in error
    ? String((error as { message: unknown }).message).toLowerCase()
    : "";
  if (message.includes("lease_expired")) return new WorkflowLeaseError("LEASE_EXPIRED", error);
  if (message.includes("lease_superseded") || message.includes("attempt_superseded") ||
      message.includes("generation_superseded")) return new WorkflowLeaseError("LEASE_LOST", error);
  if (message.includes("lease_identity_required") || message.includes("invalid")) {
    return new WorkflowLeaseError("LEASE_REJECTED", error);
  }
  return new WorkflowLeaseError("LEASE_DATABASE_ERROR", error);
}
