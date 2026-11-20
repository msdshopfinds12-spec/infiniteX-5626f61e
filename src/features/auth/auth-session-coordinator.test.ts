import assert from "node:assert/strict";
import test from "node:test";
import { createAuthSessionCoordinator } from "./auth-session-coordinator.ts";

const session = (id: string) => ({ user: { id } });

test("initial session read applies when no auth event supersedes it", () => {
  const coordinator = createAuthSessionCoordinator();
  const revision = coordinator.captureInitialReadRevision();

  const result = coordinator.applyInitialSession(revision, session("user-a"));

  assert.equal(result.applied, true);
  assert.equal(result.state.status, "authenticated");
  if (result.state.status === "authenticated") {
    assert.equal(result.state.userId, "user-a");
  }
});

test("new auth event wins over a pending stale initial session read", () => {
  const coordinator = createAuthSessionCoordinator();
  const revision = coordinator.captureInitialReadRevision();

  const eventState = coordinator.applyAuthEvent(session("user-b"));
  const staleResult = coordinator.applyInitialSession(revision, session("user-a"));

  assert.equal(staleResult.applied, false);
  assert.deepEqual(staleResult.state, eventState);
  assert.equal(staleResult.state.status, "authenticated");
  if (staleResult.state.status === "authenticated") {
    assert.equal(staleResult.state.userId, "user-b");
  }
});

test("sign-out auth event cannot be overwritten by a pending initial session", () => {
  const coordinator = createAuthSessionCoordinator();
  const revision = coordinator.captureInitialReadRevision();

  const signedOut = coordinator.applyAuthEvent(null);
  const staleResult = coordinator.applyInitialSession(revision, session("user-a"));

  assert.equal(signedOut.status, "anonymous");
  assert.equal(staleResult.applied, false);
  assert.deepEqual(staleResult.state, signedOut);
});

test("a stale initial read error cannot replace a newer authenticated event", () => {
  const coordinator = createAuthSessionCoordinator();
  const revision = coordinator.captureInitialReadRevision();

  coordinator.applyAuthEvent(session("user-a"));
  const staleError = coordinator.applyInitialError(revision);

  assert.equal(staleError.applied, false);
  assert.equal(staleError.state.status, "authenticated");
});

test("an initial read error applies only while its revision is current", () => {
  const coordinator = createAuthSessionCoordinator();
  const revision = coordinator.captureInitialReadRevision();

  const result = coordinator.applyInitialError(revision);

  assert.equal(result.applied, true);
  assert.equal(result.state.status, "error");
});

test("same-user refresh events retain the identity epoch", () => {
  const coordinator = createAuthSessionCoordinator();
  const first = coordinator.applyAuthEvent(session("user-a"));
  const refreshed = coordinator.applyAuthEvent(session("user-a"));

  assert.equal(first.status, "authenticated");
  assert.equal(refreshed.status, "authenticated");
  if (first.status === "authenticated" && refreshed.status === "authenticated") {
    assert.equal(refreshed.identityEpoch, first.identityEpoch);
  }
});
