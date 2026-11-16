import test from "node:test";
import assert from "node:assert/strict";
import { createOpaqueToken, hashOpaqueToken, equalTokenDigests } from "../src/auth/opaque-token.mjs";

test("opaque tokens are high-entropy base64url values and are stored as digests", () => {
  const token = createOpaqueToken();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  const digest = hashOpaqueToken(token);
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.notEqual(digest, token);
  assert.equal(equalTokenDigests(digest, hashOpaqueToken(token)), true);
});

test("opaque token parser rejects malformed and non-canonical values", () => {
  for (const value of ["", "token", "a".repeat(43), "a".repeat(44), null]) {
    assert.throws(() => hashOpaqueToken(value), /Opaque token is invalid/);
  }
});

test("digest comparison rejects malformed inputs without throwing", () => {
  assert.equal(equalTokenDigests("bad", "bad"), false);
  assert.equal(equalTokenDigests("a".repeat(64), "b".repeat(64)), false);
});
