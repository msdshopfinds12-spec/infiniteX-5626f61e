import { decideStepRetry, type RetryFailureKind } from "./retry-policy.ts";

/**
 * Runtime-neutral workflow attempt invariants.
 *
 * Persistence adapters must enforce these predicates atomically in the database.
 * This module is a deterministic domain layer, not a distributed lock or
 * persistence implementation.
 */

export type StepAttemptStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export type StepAttempt = Readonly<{
  id: string;
  runId: string;
  stepId: string;
  ownerId: string;
  attemptNumber: number;
  idempotencyKey: string;
  requestFingerprint: string;
  status: StepAttemptStatus;
  leaseGeneration: number;
  scheduledAtMs: number;
  startedAtMs: number | null;
  heartbeatAtMs: number | null;
  leaseExpiresAtMs: number | null;
  finishedAtMs: number | null;
  failureKind: RetryFailureKind | null;
  errorCode: string | null;
  output: JsonValue | null;
}>;

export type CreateQueuedAttemptInput = Readonly<{
  id: string;
  runId: string;
  stepId: string;
  ownerId: string;
  attemptNumber: number;
  idempotencyKey: string;
  requestFingerprint: string;
  scheduledAtMs: number;
  leaseGeneration?: number;
}>;

export type ClaimAttemptInput = Readonly<{
  nowMs: number;
  leaseDurationMs: number;
  nextLeaseGeneration: number;
}>;

export type LeaseFenceInput = Readonly<{
  nowMs: number;
  expectedLeaseGeneration: number;
}>;

const MAX_OUTPUT_CHARS = 64 * 1024;
const MAX_OUTPUT_DEPTH = 20;
const MAX_OUTPUT_NODES = 10_000;

export class StepAttemptDomainError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "StepAttemptDomainError";
    this.code = code;
  }
}

function requireText(value: string, label: string, maxLength = 200): void {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maxLength) {
    throw new StepAttemptDomainError(label + "_invalid");
  }
}

function requireSafeInteger(value: number, label: string, minimum: number): void {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new StepAttemptDomainError(label + "_invalid");
  }
}

/**
 * Canonical, deterministic key for one logical step execution.
 * The version prefix permits future format migrations without ambiguous parsing.
 * Persistence must still enforce a UNIQUE constraint and compare request fingerprints.
 */
export function canonicalStepAttemptIdempotencyKey(
  runId: string,
  stepId: string,
  attemptNumber: number,
): string {
  requireText(runId, "run_id");
  requireText(stepId, "step_id");
  requireSafeInteger(attemptNumber, "attempt_number", 1);
  let key: string;
  try {
    key = "step-attempt:v1:" + encodeURIComponent(runId) + ":" +
      encodeURIComponent(stepId) + ":" + attemptNumber;
  } catch {
    throw new StepAttemptDomainError("idempotency_identity_invalid");
  }
  requireText(key, "idempotency_key", 256);
  return key;
}

/**
 * Copies JSON-compatible output into a detached, deeply frozen snapshot.
 * Rejects executable values, accessors, cycles, sparse arrays, exotic prototypes,
 * non-finite numbers, excessive nesting, and oversized payloads.
 */
export function snapshotJsonOutput(value: unknown): JsonValue {
  const seen = new WeakSet<object>();
  let nodes = 0;

  const visit = (current: unknown, depth: number): JsonValue => {
    nodes += 1;
    if (nodes > MAX_OUTPUT_NODES) throw new StepAttemptDomainError("output_node_limit_exceeded");
    if (depth > MAX_OUTPUT_DEPTH) throw new StepAttemptDomainError("output_depth_limit_exceeded");

    if (current === null || typeof current === "boolean") return current;
    if (typeof current === "string") {
      if (current.length > MAX_OUTPUT_CHARS) throw new StepAttemptDomainError("output_size_limit_exceeded");
      return current;
    }
    if (typeof current === "number") {
      if (!Number.isFinite(current)) throw new StepAttemptDomainError("output_number_invalid");
      return current;
    }
    if (typeof current !== "object") {
      throw new StepAttemptDomainError("output_type_invalid");
    }

    const objectValue = current as object;
    if (seen.has(objectValue)) throw new StepAttemptDomainError("output_cycle_detected");
    seen.add(objectValue);

    if (Array.isArray(current)) {
      if (Object.getPrototypeOf(current) !== Array.prototype) {
        throw new StepAttemptDomainError("output_array_prototype_invalid");
      }
      const ownKeys = Reflect.ownKeys(current);
      if (ownKeys.some((key) => key !== "length" &&
          (typeof key !== "string" || !/^(0|[1-9][0-9]*)$/.test(key)))) {
        throw new StepAttemptDomainError("output_array_property_invalid");
      }
      const copy: JsonValue[] = [];
      for (let index = 0; index < current.length; index += 1) {
        if (!Object.prototype.hasOwnProperty.call(current, index)) {
          throw new StepAttemptDomainError("output_sparse_array_invalid");
        }
        const descriptor = Object.getOwnPropertyDescriptor(current, String(index));
        if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
          throw new StepAttemptDomainError("output_accessor_invalid");
        }
        copy.push(visit(descriptor.value, depth + 1));
      }
      return Object.freeze(copy);
    }

    const prototype = Object.getPrototypeOf(current);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new StepAttemptDomainError("output_object_prototype_invalid");
    }

    const keys = Reflect.ownKeys(current);
    if (keys.some((key) => typeof key !== "string")) {
      throw new StepAttemptDomainError("output_symbol_key_invalid");
    }
    const copy: { [key: string]: JsonValue } = {};
    for (const key of keys as string[]) {
      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
        throw new StepAttemptDomainError("output_accessor_invalid");
      }
      Object.defineProperty(copy, key, {
        value: visit(descriptor.value, depth + 1),
        enumerable: true,
        configurable: false,
        writable: false,
      });
    }
    return Object.freeze(copy);
  };

  const snapshot = visit(value, 0);
  let serialized: string;
  try {
    serialized = JSON.stringify(snapshot);
  } catch {
    throw new StepAttemptDomainError("output_serialization_invalid");
  }
  if (serialized.length > MAX_OUTPUT_CHARS) {
    throw new StepAttemptDomainError("output_size_limit_exceeded");
  }
  return snapshot;
}

function assertActiveLease(attempt: StepAttempt, input: LeaseFenceInput): void {
  requireSafeInteger(input.nowMs, "now_ms", 0);
  requireSafeInteger(input.expectedLeaseGeneration, "lease_generation", 1);
  if (attempt.status !== "running" ||
      attempt.leaseGeneration !== input.expectedLeaseGeneration ||
      attempt.startedAtMs === null ||
      attempt.heartbeatAtMs === null ||
      attempt.leaseExpiresAtMs === null ||
      input.nowMs >= attempt.leaseExpiresAtMs) {
    throw new StepAttemptDomainError("stale_or_expired_lease");
  }
}

function assertTerminal(attempt: StepAttempt): never {
  if (attempt.status === "succeeded" || attempt.status === "failed" || attempt.status === "cancelled") {
    throw new StepAttemptDomainError("terminal_attempt_immutable");
  }
  throw new StepAttemptDomainError("attempt_transition_invalid");
}

function assertNotTerminal(attempt: StepAttempt): void {
  if (attempt.status === "succeeded" || attempt.status === "failed" || attempt.status === "cancelled") {
    assertTerminal(attempt);
  }
}

/** Creates an attempt projection with identity supplied by a trusted adapter. */
export function createQueuedStepAttempt(input: CreateQueuedAttemptInput): StepAttempt {
  requireText(input.id, "attempt_id");
  requireText(input.runId, "run_id");
  requireText(input.stepId, "step_id");
  requireText(input.ownerId, "owner_id");
  requireText(input.idempotencyKey, "idempotency_key", 256);
  requireText(input.requestFingerprint, "request_fingerprint", 256);
  requireSafeInteger(input.attemptNumber, "attempt_number", 1);
  requireSafeInteger(input.scheduledAtMs, "scheduled_at_ms", 0);
  const leaseGeneration = input.leaseGeneration ?? 0;
  requireSafeInteger(leaseGeneration, "lease_generation", 0);

  return {
    id: input.id,
    runId: input.runId,
    stepId: input.stepId,
    ownerId: input.ownerId,
    attemptNumber: input.attemptNumber,
    idempotencyKey: input.idempotencyKey,
    requestFingerprint: input.requestFingerprint,
    status: "queued",
    leaseGeneration,
    scheduledAtMs: input.scheduledAtMs,
    startedAtMs: null,
    heartbeatAtMs: null,
    leaseExpiresAtMs: null,
    finishedAtMs: null,
    failureKind: null,
    errorCode: null,
    output: null,
  };
}

/**
 * Claims a due queued attempt. The caller must atomically allocate the next
 * generation in persistence; this function only validates the expected CAS.
 */
export function claimStepAttempt(
  attempt: StepAttempt,
  input: ClaimAttemptInput,
): StepAttempt {
  if (attempt.status !== "queued") return assertTerminal(attempt);
  requireSafeInteger(input.nowMs, "now_ms", 0);
  requireSafeInteger(input.leaseDurationMs, "lease_duration_ms", 1);
  requireSafeInteger(input.nextLeaseGeneration, "lease_generation", 1);
  if (input.nowMs < attempt.scheduledAtMs) {
    throw new StepAttemptDomainError("attempt_not_due");
  }
  if (attempt.leaseGeneration >= Number.MAX_SAFE_INTEGER ||
      input.nextLeaseGeneration !== attempt.leaseGeneration + 1) {
    throw new StepAttemptDomainError("lease_generation_conflict");
  }
  const leaseExpiresAtMs = input.nowMs + input.leaseDurationMs;
  if (!Number.isSafeInteger(leaseExpiresAtMs)) {
    throw new StepAttemptDomainError("lease_expiry_overflow");
  }
  return {
    ...attempt,
    status: "running",
    leaseGeneration: input.nextLeaseGeneration,
    startedAtMs: input.nowMs,
    heartbeatAtMs: input.nowMs,
    leaseExpiresAtMs,
  };
}

/** Extends only the currently active lease; heartbeat time cannot move backwards. */
export function heartbeatStepAttempt(
  attempt: StepAttempt,
  input: LeaseFenceInput & Readonly<{ leaseDurationMs: number }>,
): StepAttempt {
  assertNotTerminal(attempt);
  assertActiveLease(attempt, input);
  requireSafeInteger(input.leaseDurationMs, "lease_duration_ms", 1);
  if (attempt.heartbeatAtMs !== null && input.nowMs < attempt.heartbeatAtMs) {
    throw new StepAttemptDomainError("timestamp_regression");
  }
  const leaseExpiresAtMs = input.nowMs + input.leaseDurationMs;
  if (!Number.isSafeInteger(leaseExpiresAtMs)) {
    throw new StepAttemptDomainError("lease_expiry_overflow");
  }
  return { ...attempt, heartbeatAtMs: input.nowMs, leaseExpiresAtMs };
}

export type FinishAttemptInput = LeaseFenceInput & Readonly<{
  outcome: "succeeded" | "failed";
  failureKind?: RetryFailureKind;
  errorCode?: string | null;
  output?: unknown;
}>;

/** Completes an attempt only while its exact lease generation is still valid. */
export function finishStepAttempt(
  attempt: StepAttempt,
  input: FinishAttemptInput,
): StepAttempt {
  assertNotTerminal(attempt);
  assertActiveLease(attempt, input);
  if (attempt.heartbeatAtMs !== null && input.nowMs < attempt.heartbeatAtMs) {
    throw new StepAttemptDomainError("timestamp_regression");
  }
  if (input.outcome === "failed" && !input.failureKind) {
    throw new StepAttemptDomainError("failure_kind_required");
  }
  if (input.outcome === "succeeded" && input.failureKind) {
    throw new StepAttemptDomainError("success_failure_kind_conflict");
  }
  const errorCode = input.errorCode ?? null;
  if (errorCode !== null && !/^[a-z0-9_]{1,64}$/.test(errorCode)) {
    throw new StepAttemptDomainError("error_code_invalid");
  }
  const output = input.outcome === "succeeded"
    ? snapshotJsonOutput(input.output ?? null)
    : null;
  return {
    ...attempt,
    status: input.outcome,
    finishedAtMs: input.nowMs,
    leaseExpiresAtMs: null,
    failureKind: input.outcome === "failed" ? input.failureKind! : null,
    errorCode: input.outcome === "failed" ? errorCode : null,
    output,
  };
}

/** Owner authorization and completion/cancellation arbitration belong to persistence/API. */
export function cancelStepAttempt(
  attempt: StepAttempt,
  input: Readonly<{ nowMs: number; expectedLeaseGeneration: number }>,
): StepAttempt {
  requireSafeInteger(input.nowMs, "now_ms", 0);
  requireSafeInteger(input.expectedLeaseGeneration, "lease_generation", 0);
  assertNotTerminal(attempt);
  if (attempt.status !== "queued" && attempt.status !== "running") {
    throw new StepAttemptDomainError("attempt_transition_invalid");
  }
  if (attempt.leaseGeneration !== input.expectedLeaseGeneration) {
    throw new StepAttemptDomainError("lease_generation_conflict");
  }
  const lastLifecycleTime = attempt.status === "queued"
    ? attempt.scheduledAtMs
    : Math.max(attempt.startedAtMs ?? 0, attempt.heartbeatAtMs ?? 0);
  if (input.nowMs < lastLifecycleTime) {
    throw new StepAttemptDomainError("timestamp_regression");
  }
  return {
    ...attempt,
    status: "cancelled",
    finishedAtMs: input.nowMs,
    leaseExpiresAtMs: null,
    failureKind: "cancelled",
    errorCode: "cancelled",
    output: null,
  };
}

export type RetryPlan =
  | Readonly<{ kind: "retry"; failedAttempt: StepAttempt; nextAttempt: StepAttempt; delayMs: number; scheduledAtMs: number }>
  | Readonly<{ kind: "exhausted"; failedAttempt: StepAttempt; totalAllowedAttempts: number }>
  | Readonly<{ kind: "not_retryable"; failedAttempt: StepAttempt; failureKind: "permanent" | "cancelled" }>;

/**
 * Converts a terminal failed attempt into a decision and, when allowed,
 * creates a distinct queued attempt. The failed row is never reopened.
 */
export function planNextStepAttempt(input: Readonly<{
  failedAttempt: StepAttempt;
  nextAttemptId: string;
  retryLimit: number;
  nowMs: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterRatio?: number;
  random?: () => number;
}>): RetryPlan {
  const failed = input.failedAttempt;
  if (failed.status !== "failed" || failed.failureKind === null) {
    throw new StepAttemptDomainError("retry_requires_failed_attempt");
  }
  const decision = decideStepRetry({
    attemptNumber: failed.attemptNumber,
    retryLimit: input.retryLimit,
    failureKind: failed.failureKind,
    nowMs: input.nowMs,
    ...(input.baseDelayMs === undefined ? {} : { baseDelayMs: input.baseDelayMs }),
    ...(input.maxDelayMs === undefined ? {} : { maxDelayMs: input.maxDelayMs }),
    ...(input.jitterRatio === undefined ? {} : { jitterRatio: input.jitterRatio }),
    ...(input.random === undefined ? {} : { random: input.random }),
  });
  if (decision.kind === "not_retryable") {
    return { kind: "not_retryable", failedAttempt: failed, failureKind: decision.failureKind };
  }
  if (decision.kind === "exhausted") {
    return { kind: "exhausted", failedAttempt: failed, totalAllowedAttempts: decision.totalAllowedAttempts };
  }
  const nextAttempt = createQueuedStepAttempt({
    id: input.nextAttemptId,
    runId: failed.runId,
    stepId: failed.stepId,
    ownerId: failed.ownerId,
    attemptNumber: decision.nextAttemptNumber,
    idempotencyKey: canonicalStepAttemptIdempotencyKey(
      failed.runId,
      failed.stepId,
      decision.nextAttemptNumber,
    ),
    requestFingerprint: failed.requestFingerprint,
    scheduledAtMs: decision.scheduledAtMs,
    leaseGeneration: failed.leaseGeneration,
  });
  return {
    kind: "retry",
    failedAttempt: failed,
    nextAttempt,
    delayMs: decision.delayMs,
    scheduledAtMs: decision.scheduledAtMs,
  };
}
