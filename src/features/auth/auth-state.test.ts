import assert from "node:assert/strict";
import test from "node:test";
import {
  createInitialAuthState,
  isCurrentIdentityEpoch,
  resolveAuthSession,
} from "./auth-state.ts";

test("initial state is loading and has no authenticated identity", () => {
  assert.deepEqual(createInitialAuthState(), {
    status: "loading",
    identityEpoch: 0,
  });
});

test("session restoration establishes the authenticated identity", () => {
  const state = resolveAuthSession(createInitialAuthState(), {
    user: { id: "user-a" },
  });

  assert.deepEqual(state, {
    status: "authenticated",
    userId: "user-a",
    identityEpoch: 1,
  });
});

test("same-user token refresh does not invalidate identity-scoped work", () => {
  const initial = resolveAuthSession(createInitialAuthState(), {
    user: { id: "user-a" },
  });
  const refreshed = resolveAuthSession(initial, { user: { id: "user-a" } });

  assert.equal(refreshed.identityEpoch, initial.identityEpoch);
});

test("account switch increments the epoch and fences prior requests", () => {
  const userA = resolveAuthSession(createInitialAuthState(), {
    user: { id: "user-a" },
  });
  const userB = resolveAuthSession(userA, { user: { id: "user-b" } });

  assert.equal(userB.status, "authenticated");
  assert.equal(userB.identityEpoch, userA.identityEpoch + 1);
  assert.equal(isCurrentIdentityEpoch(userB, userA.identityEpoch), false);
  assert.equal(isCurrentIdentityEpoch(userB, userB.identityEpoch), true);
});

test("sign-out increments the epoch and invalidates prior requests", () => {
  const authenticated = resolveAuthSession(createInitialAuthState(), {
    user: { id: "user-a" },
  });
  const anonymous = resolveAuthSession(authenticated, null);

  assert.equal(anonymous.status, "anonymous");
  assert.equal(anonymous.identityEpoch, authenticated.identityEpoch + 1);
  assert.equal(isCurrentIdentityEpoch(anonymous, authenticated.identityEpoch), false);
});

test("empty user identity fails closed", () => {
  const state = resolveAuthSession(createInitialAuthState(), {
    user: { id: "   " },
  });

  assert.equal(state.status, "error");
  assert.equal(isCurrentIdentityEpoch(state, state.identityEpoch), false);
});
