import test from "node:test";
import assert from "node:assert/strict";
import { createCsrfToken, verifyCsrfToken } from "../src/auth/csrf.mjs";

test("CSRF token verifies only against its stored digest", () => {
  const csrf = createCsrfToken();
  assert.equal(verifyCsrfToken({ token: csrf.token, expectedTokenHash: csrf.tokenHash }), true);
  assert.equal(verifyCsrfToken({ token: "wrong", expectedTokenHash: csrf.tokenHash }), false);
  assert.equal(verifyCsrfToken({ token: csrf.token, expectedTokenHash: "invalid" }), false);
});

test("CSRF tokens are independently generated", () => {
  const first = createCsrfToken();
  const second = createCsrfToken();
  assert.notEqual(first.token, second.token);
  assert.notEqual(first.tokenHash, second.tokenHash);
});
