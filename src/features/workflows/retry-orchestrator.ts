import {
  canonicalStepAttemptIdempotencyKey,
  finishStepAttempt,
  planNextStepAttempt,
  type RetryPlan,
  type StepAttempt,
} from "./attempt-ledger.ts";
import type { RetryFailureKind } from "./retry-policy.ts";

export type RetryOutboxEvent = Readonly<{
  id: string;
  type: "workflow.step_attempt.due";
  attemptId: string;
  runId: string;
  stepId: string;
  scheduledAtMs: number;
}>;

export type RetryProjectionUpdate = Readonly<{
  runId: string;
  stepId: string;
  currentAttemptId: string;
  status: "queued" | "failed";
}>;

/**
 * Contract for a trusted server-side adapter. Implementations MUST provide a
 * single real DB transaction, row locking/CAS, owner predicates and unique
 * constraints. This interface is not a persistence implementation.
 */
export interface RetryTransaction {
  lockAttempt(input: Readonly<{ attemptId: string; ownerId: string }>): Promise<StepAttempt | null>;
  findAttemptByIdempotencyKey(input: Readonly<{ ownerId: string; idempotencyKey: string }>): Promise<StepAttempt | null>;
  persistTerminalFailure(input: Readonly<{
    attemptId: string;
    expectedLeaseGeneration: number;
    failedAttempt: StepAttempt;
  }>): Promise<boolean>;
  insertAttemptIfAbsent(attempt: StepAttempt): Promise<Readonly<{ created: boolean; attempt: StepAttempt }>>;
  updateProjection(update: RetryProjectionUpdate): Promise<void>;
  insertOutboxEventIfAbsent(event: RetryOutboxEvent): Promise<void>;
}

export interface RetryTransactionStore {
  transaction<T>(work: (tx: RetryTransaction) => Promise<T>): Promise<T>;
}

export type ScheduleRetryInput = Readonly<{
  attemptId: string;
  ownerId: string;
  expectedLeaseGeneration: number;
  nowMs: number;
  retryLimit: number;
  failureKind: RetryFailureKind;
  errorCode?: string | null;
  nextAttemptId: string;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterRatio?: number;
  random?: () => number;
}>;

export type ScheduleRetryResult =
  | Readonly<{ kind: "retry_scheduled"; failedAttempt: StepAttempt; nextAttempt: StepAttempt; delayMs: number; scheduledAtMs: number; replayed: boolean }>
  | Readonly<{ kind: "failed"; failedAttempt: StepAttempt; reason: "exhausted" | "not_retryable" }>
  | Readonly<{ kind: "already_scheduled"; nextAttempt: StepAttempt }>
  | Readonly<{ kind: "already_terminal"; attempt: StepAttempt }>;

function sameRetryIdentity(expected: StepAttempt, actual: StepAttempt): boolean {
  return actual.runId === expected.runId &&
    actual.stepId === expected.stepId &&
    actual.ownerId === expected.ownerId &&
    actual.attemptNumber === expected.attemptNumber &&
    actual.idempotencyKey === expected.idempotencyKey &&
    actual.requestFingerprint === expected.requestFingerprint;
}

function requireSafeText(value: string, name: string): void {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 200) {
    throw new TypeError(name + "_invalid");
  }
}

/**
 * Terminalizes a failed execution and atomically schedules a distinct queued
 * attempt plus outbox signal. It never performs provider side effects.
 */
export async function failAndScheduleRetryAtomically(
  store: RetryTransactionStore,
  input: ScheduleRetryInput,
): Promise<ScheduleRetryResult> {
  requireSafeText(input.attemptId, "attempt_id");
  requireSafeText(input.ownerId, "owner_id");
  requireSafeText(input.nextAttemptId, "next_attempt_id");

  return store.transaction(async (tx) => {
    const current = await tx.lockAttempt({ attemptId: input.attemptId, ownerId: input.ownerId });
    // Same response for nonexistent and other-owner attempts: avoid an ownership oracle.
    if (!current) throw new Error("attempt_not_found");
    if (current.ownerId !== input.ownerId) throw new Error("attempt_not_found");

    // Replay after commit returns the already-created logical retry.
    if (current.status === "failed") {
      const nextKey = canonicalStepAttemptIdempotencyKey(
        current.runId, current.stepId, current.attemptNumber + 1,
      );
      const existing = await tx.findAttemptByIdempotencyKey({
        ownerId: input.ownerId, idempotencyKey: nextKey,
      });
      if (existing) {
        if (existing.requestFingerprint !== current.requestFingerprint ||
            existing.runId !== current.runId ||
            existing.stepId !== current.stepId ||
            existing.attemptNumber !== current.attemptNumber + 1) {
          throw new Error("retry_idempotency_conflict");
        }
        return { kind: "already_scheduled", nextAttempt: existing };
      }
      return { kind: "already_terminal", attempt: current };
    }

    if (current.status !== "running") {
      if (current.status === "queued") throw new Error("attempt_not_running");
      return { kind: "already_terminal", attempt: current };
    }

    const failedAttempt = finishStepAttempt(current, {
      nowMs: input.nowMs,
      expectedLeaseGeneration: input.expectedLeaseGeneration,
      outcome: "failed",
      failureKind: input.failureKind,
      ...(input.errorCode === undefined ? {} : { errorCode: input.errorCode }),
    });

    const plan: RetryPlan = planNextStepAttempt({
      failedAttempt,
      nextAttemptId: input.nextAttemptId,
      retryLimit: input.retryLimit,
      nowMs: input.nowMs,
      ...(input.baseDelayMs === undefined ? {} : { baseDelayMs: input.baseDelayMs }),
      ...(input.maxDelayMs === undefined ? {} : { maxDelayMs: input.maxDelayMs }),
      ...(input.jitterRatio === undefined ? {} : { jitterRatio: input.jitterRatio }),
      ...(input.random === undefined ? {} : { random: input.random }),
    });

    const persisted = await tx.persistTerminalFailure({
      attemptId: current.id,
      expectedLeaseGeneration: input.expectedLeaseGeneration,
      failedAttempt,
    });
    if (!persisted) throw new Error("attempt_failure_cas_conflict");

    if (plan.kind !== "retry") {
      await tx.updateProjection({
        runId: current.runId, stepId: current.stepId,
        currentAttemptId: current.id, status: "failed",
      });
      return { kind: "failed", failedAttempt, reason: plan.kind };
    }

    const inserted = await tx.insertAttemptIfAbsent(plan.nextAttempt);
    if (!sameRetryIdentity(plan.nextAttempt, inserted.attempt)) {
      throw new Error("retry_idempotency_conflict");
    }

    await tx.updateProjection({
      runId: current.runId, stepId: current.stepId,
      currentAttemptId: inserted.attempt.id, status: "queued",
    });
    await tx.insertOutboxEventIfAbsent({
      id: "workflow-step-attempt-due:v1:" + inserted.attempt.id,
      type: "workflow.step_attempt.due",
      attemptId: inserted.attempt.id,
      runId: inserted.attempt.runId,
      stepId: inserted.attempt.stepId,
      scheduledAtMs: inserted.attempt.scheduledAtMs,
    });

    return {
      kind: "retry_scheduled",
      failedAttempt,
      nextAttempt: inserted.attempt,
      delayMs: plan.delayMs,
      scheduledAtMs: inserted.attempt.scheduledAtMs,
      replayed: !inserted.created,
    };
  });
}
