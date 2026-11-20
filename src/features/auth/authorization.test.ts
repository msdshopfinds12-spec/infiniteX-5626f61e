import assert from "node:assert/strict";
import test from "node:test";
import { evaluateCapabilityAccess } from "./authorization.ts";
import type { AuthState } from "./auth-state.ts";

const authenticated: AuthState = {
  status: "authenticated",
  userId: "user-a",
  identityEpoch: 3,
};
const snapshot = {
  subjectId: "user-a",
  permissions: ["workspace.read", "workflows.read"] as const,
  expiresAt: 10_000,
};

test("allows a capability in a current same-subject authorization snapshot", () => {
  assert.deepEqual(
    evaluateCapabilityAccess(authenticated, snapshot, "workspace.read", 9_000),
    { allowed: true },
  );
});

test("denies when authentication is not verified", () => {
  assert.deepEqual(
    evaluateCapabilityAccess({ status: "loading", identityEpoch: 0 }, snapshot, "workspace.read", 1),
    { allowed: false, reason: "unauthenticated" },
  );
});

test("denies when authorization snapshot is unavailable", () => {
  assert.deepEqual(
    evaluateCapabilityAccess(authenticated, null, "workspace.read", 1),
    { allowed: false, reason: "snapshot-unavailable" },
  );
});

test("denies a snapshot belonging to another account", () => {
  assert.deepEqual(
    evaluateCapabilityAccess(authenticated, { ...snapshot, subjectId: "user-b" }, "workspace.read", 1),
    { allowed: false, reason: "identity-mismatch" },
  );
});

test("denies expired or invalid snapshot timestamps", () => {
  assert.deepEqual(
    evaluateCapabilityAccess(authenticated, { ...snapshot, expiresAt: 1 }, "workspace.read", 1),
    { allowed: false, reason: "snapshot-expired" },
  );
  assert.deepEqual(
    evaluateCapabilityAccess(authenticated, { ...snapshot, expiresAt: Number.NaN }, "workspace.read", 1),
    { allowed: false, reason: "snapshot-unavailable" },
  );
});

test("denies capabilities absent from the snapshot", () => {
  assert.deepEqual(
    evaluateCapabilityAccess(authenticated, snapshot, "workflows.execute", 1),
    { allowed: false, reason: "permission-denied" },
  );
});

test("denies malformed runtime permission snapshots without throwing", () => {
  const malformed = {
    subjectId: "user-a",
    permissions: null,
    expiresAt: 10_000,
  };
  assert.deepEqual(
    evaluateCapabilityAccess(authenticated, malformed as never, "workspace.read", 1),
    { allowed: false, reason: "snapshot-unavailable" },
  );
});
