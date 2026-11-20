import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalStepAttemptIdempotencyKey,
  claimStepAttempt,
  createQueuedStepAttempt,
  type StepAttempt,
} from "./attempt-ledger.ts";
import {
  failAndScheduleRetryAtomically,
  type RetryOutboxEvent,
  type RetryProjectionUpdate,
  type RetryTransaction,
  type RetryTransactionStore,
} from "./retry-orchestrator.ts";

type State = {
  attempts: Map<string, StepAttempt>;
  projections: Map<string, RetryProjectionUpdate>;
  outbox: Map<string, RetryOutboxEvent>;
};

class MemoryRetryStore implements RetryTransactionStore {
  private state: State;
  failOutboxInsert = false;

  constructor(attempts: StepAttempt[]) {
    this.state = {
      attempts: new Map(attempts.map((attempt) => [attempt.id, attempt])),
      projections: new Map(),
      outbox: new Map(),
    };
  }

  snapshot(): State {
    return {
      attempts: new Map(this.state.attempts),
      projections: new Map(this.state.projections),
      outbox: new Map(this.state.outbox),
    };
  }

  async transaction<T>(work: (tx: RetryTransaction) => Promise<T>): Promise<T> {
    const draft = this.snapshot();
    const tx: RetryTransaction = {
      lockAttempt: async ({ attemptId, ownerId }) => {
        const attempt = draft.attempts.get(attemptId);
        return attempt?.ownerId === ownerId ? attempt : null;
      },
      findAttemptByIdempotencyKey: async ({ ownerId, idempotencyKey }) =>
        [...draft.attempts.values()].find((attempt) =>
          attempt.ownerId === ownerId && attempt.idempotencyKey === idempotencyKey,
        ) ?? null,
      persistTerminalFailure: async ({ attemptId, expectedLeaseGeneration, failedAttempt }) => {
        const current = draft.attempts.get(attemptId);
        if (!current || current.status !== "running" ||
            current.leaseGeneration !== expectedLeaseGeneration) return false;
        draft.attempts.set(attemptId, failedAttempt);
        return true;
      },
      insertAttemptIfAbsent: async (attempt) => {
        const existing = [...draft.attempts.values()].find((candidate) =>
          candidate.ownerId === attempt.ownerId && candidate.idempotencyKey === attempt.idempotencyKey,
        );
        if (existing) return { created: false, attempt: existing };
        draft.attempts.set(attempt.id, attempt);
        return { created: true, attempt };
      },
      updateProjection: async (update) => {
        draft.projections.set(update.runId + ":" + update.stepId, update);
      },
      insertOutboxEventIfAbsent: async (event) => {
        if (this.failOutboxInsert) throw new Error("synthetic_outbox_failure");
        if (!draft.outbox.has(event.id)) draft.outbox.set(event.id, event);
      },
    };
    const result = await work(tx);
    this.state = draft;
    return result;
  }
}

function runningAttempt(): StepAttempt {
  const queued = createQueuedStepAttempt({
    id: "attempt-1", runId: "run-1", stepId: "step-1", ownerId: "owner-1",
    attemptNumber: 1,
    idempotencyKey: canonicalStepAttemptIdempotencyKey("run-1", "step-1", 1),
    requestFingerprint: "sha256:synthetic", scheduledAtMs: 1_000,
  });
  return claimStepAttempt(queued, {
    nowMs: 1_000, leaseDurationMs: 5_000, nextLeaseGeneration: 1,
  });
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    attemptId: "attempt-1", ownerId: "owner-1", expectedLeaseGeneration: 1,
    nowMs: 1_100, retryLimit: 1, failureKind: "transient" as const,
    errorCode: "provider_timeout", nextAttemptId: "attempt-2", jitterRatio: 0,
    ...overrides,
  };
}

test("atomically persists failed attempt, next queued attempt, projection and outbox", async () => {
  const store = new MemoryRetryStore([runningAttempt()]);
  const result = await failAndScheduleRetryAtomically(store, input());
  assert.equal(result.kind, "retry_scheduled");
  if (result.kind !== "retry_scheduled") return;
  assert.equal(result.failedAttempt.status, "failed");
  assert.equal(result.nextAttempt.status, "queued");
  assert.equal(result.nextAttempt.attemptNumber, 2);
  assert.equal(result.nextAttempt.scheduledAtMs, 2_100);
  const state = store.snapshot();
  assert.equal(state.attempts.get("attempt-1")?.status, "failed");
  assert.equal(state.attempts.get("attempt-2")?.status, "queued");
  assert.equal(state.projections.get("run-1:step-1")?.currentAttemptId, "attempt-2");
  assert.equal(state.outbox.size, 1);
});

test("retry limit zero fails terminally without another attempt", async () => {
  const store = new MemoryRetryStore([runningAttempt()]);
  const result = await failAndScheduleRetryAtomically(store, input({ retryLimit: 0 }));
  assert.equal(result.kind, "failed");
  const state = store.snapshot();
  assert.equal(state.attempts.size, 1);
  assert.equal(state.projections.get("run-1:step-1")?.status, "failed");
  assert.equal(state.outbox.size, 0);
});

test("permanent and cancelled failures never create retries", async () => {
  for (const failureKind of ["permanent", "cancelled"] as const) {
    const store = new MemoryRetryStore([runningAttempt()]);
    const result = await failAndScheduleRetryAtomically(store, input({ failureKind }));
    assert.equal(result.kind, "failed");
    assert.equal(store.snapshot().attempts.size, 1);
  }
});

test("stale lease generation fails closed without mutating state", async () => {
  const store = new MemoryRetryStore([runningAttempt()]);
  await assert.rejects(failAndScheduleRetryAtomically(store, input({ expectedLeaseGeneration: 2 })), /stale_or_expired_lease/);
  assert.equal(store.snapshot().attempts.get("attempt-1")?.status, "running");
});

test("transaction rollback leaves attempt, projection and outbox unchanged", async () => {
  const store = new MemoryRetryStore([runningAttempt()]);
  store.failOutboxInsert = true;
  await assert.rejects(failAndScheduleRetryAtomically(store, input()), /synthetic_outbox_failure/);
  const state = store.snapshot();
  assert.equal(state.attempts.size, 1);
  assert.equal(state.attempts.get("attempt-1")?.status, "running");
  assert.equal(state.projections.size, 0);
  assert.equal(state.outbox.size, 0);
});

test("duplicate delivery after commit returns the existing next attempt", async () => {
  const store = new MemoryRetryStore([runningAttempt()]);
  const first = await failAndScheduleRetryAtomically(store, input());
  const replay = await failAndScheduleRetryAtomically(store, input({ nextAttemptId: "attempt-2-new" }));
  assert.equal(first.kind, "retry_scheduled");
  assert.equal(replay.kind, "already_scheduled");
  if (replay.kind === "already_scheduled") {
    assert.equal(replay.nextAttempt.id, "attempt-2");
    assert.equal(replay.nextAttempt.attemptNumber, 2);
  }
  assert.equal(store.snapshot().attempts.size, 2);
  assert.equal(store.snapshot().outbox.size, 1);
});

test("owner mismatch is indistinguishable from a missing attempt", async () => {
  const store = new MemoryRetryStore([runningAttempt()]);
  await assert.rejects(failAndScheduleRetryAtomically(store, input({ ownerId: "owner-2" })), /attempt_not_found/);
  assert.equal(store.snapshot().attempts.size, 1);
});

test("outbox event identity is stable and scoped to the next attempt", async () => {
  const store = new MemoryRetryStore([runningAttempt()]);
  await failAndScheduleRetryAtomically(store, input());
  const event = [...store.snapshot().outbox.values()][0];
  assert.equal(event.id, "workflow-step-attempt-due:v1:attempt-2");
  assert.equal(event.type, "workflow.step_attempt.due");
});
