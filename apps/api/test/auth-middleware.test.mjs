import test from "node:test";
import assert from "node:assert/strict";
import { createOpaqueToken, hashOpaqueToken } from "../src/auth/opaque-token.mjs";
import { createCsrfToken } from "../src/auth/csrf.mjs";
import { serializeSessionCookie } from "../src/auth/cookie-policy.mjs";
import { resolveRequestPrincipal, verifyMutationRequest } from "../src/auth/middleware.mjs";

const USER_ID = "2d931510-d99f-494a-8c67-87feb05e1594";
const ORIGIN = "https://app.example.test";

test("request principal is derived only from a resolved server session", async () => {
  const token = createOpaqueToken();
  const csrf = createCsrfToken();
  const cookie = serializeSessionCookie({ value: token, maxAgeSeconds: 300 });
  const sessionService = {
    async resolve(value) {
      assert.equal(value, token);
      return { userId: USER_ID, active: true, csrfTokenHash: csrf.tokenHash, expiresAt: "2030-01-01T00:00:00.000Z" };
    }
  };
  const result = await resolveRequestPrincipal({ headers: { cookie } }, { sessionService });
  assert.equal(result.authenticated, true);
  assert.equal(result.principal.userId, USER_ID);
  assert.equal("token" in result, false);
});

test("missing and invalid sessions fail closed", async () => {
  const sessionService = { async resolve() { return null; } };
  assert.equal((await resolveRequestPrincipal({ headers: {} }, { sessionService })).reason, "SESSION_MISSING");
  const token = createOpaqueToken();
  const cookie = serializeSessionCookie({ value: token, maxAgeSeconds: 300 });
  assert.equal((await resolveRequestPrincipal({ headers: { cookie } }, { sessionService })).reason, "SESSION_INVALID");
});

test("session repository failures propagate for fail-closed service handling", async () => {
  const token = createOpaqueToken();
  const cookie = serializeSessionCookie({ value: token, maxAgeSeconds: 300 });
  const sessionService = { async resolve() { throw new Error("repository unavailable"); } };
  await assert.rejects(() => resolveRequestPrincipal({ headers: { cookie } }, { sessionService }), /repository unavailable/);
});

test("safe methods do not require CSRF tokens", () => {
  assert.equal(verifyMutationRequest({ method: "GET", headers: {} }, {}).allowed, true);
});

test("mutations require session, trusted origin, and matching CSRF token", () => {
  const csrf = createCsrfToken();
  const session = { csrfTokenHash: csrf.tokenHash };
  const allowedOrigins = [ORIGIN];
  const request = { method: "POST", headers: { origin: ORIGIN, "x-csrf-token": csrf.token } };
  assert.equal(verifyMutationRequest(request, { session, allowedOrigins }).allowed, true);
  assert.equal(verifyMutationRequest({ ...request, headers: { ...request.headers, origin: "https://evil.example" } }, { session, allowedOrigins }).reason, "ORIGIN_NOT_ALLOWED");
  assert.equal(verifyMutationRequest({ ...request, headers: { origin: ORIGIN, "x-csrf-token": createOpaqueToken() } }, { session, allowedOrigins }).reason, "CSRF_INVALID");
  assert.equal(verifyMutationRequest(request, { allowedOrigins }).reason, "SESSION_REQUIRED");
});

test("unsupported methods are denied", () => {
  assert.equal(verifyMutationRequest({ method: "TRACE", headers: {} }, {}).reason, "METHOD_NOT_ALLOWED");
});
