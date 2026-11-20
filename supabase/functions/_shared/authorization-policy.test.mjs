import assert from "node:assert/strict";
import test from "node:test";
import {
  createPolicyUnavailablePayload,
  isEmptyAuthorizationRequest,
  POLICY_UNAVAILABLE_CODE,
} from "./authorization-policy.mjs";

test("authorization contract accepts only an empty JSON object", () => {
  assert.equal(isEmptyAuthorizationRequest({}), true);
  assert.equal(isEmptyAuthorizationRequest({ user_id: "attacker" }), false);
  assert.equal(isEmptyAuthorizationRequest({ role: "admin" }), false);
  assert.equal(isEmptyAuthorizationRequest({ permissions: ["settings.manage"] }), false);
  assert.equal(isEmptyAuthorizationRequest(null), false);
  assert.equal(isEmptyAuthorizationRequest([]), false);
  assert.equal(isEmptyAuthorizationRequest("{}"), false);
});

test("unverified policy source always produces a non-granting response", () => {
  const payload = createPolicyUnavailablePayload();
  assert.equal(payload.ok, false);
  assert.equal(payload.error, POLICY_UNAVAILABLE_CODE);
  assert.deepEqual(payload.permissions, []);
  assert.equal(Object.isFrozen(payload), true);
  assert.equal(Object.isFrozen(payload.permissions), true);
  assert.equal("subjectId" in payload, false);
  assert.equal("role" in payload, false);
});
