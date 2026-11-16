import test from "node:test";
import assert from "node:assert/strict";
import {
  readSessionCookie,
  serializeExpiredSessionCookie,
  serializeSessionCookie,
} from "../src/auth/cookie-policy.mjs";

const token = "A".repeat(43);

test("session cookie uses secure host-only browser defaults", () => {
  const cookie = serializeSessionCookie({ value: token, maxAgeSeconds: 3600 });
  assert.match(cookie, /^__Host-infinite_x_session=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /Path=\//);
  assert.match(cookie, /SameSite=Lax/);
  assert.doesNotMatch(cookie, /Domain=/);
});

test("session cookie rejects insecure or weak policy overrides", () => {
  assert.throws(() => serializeSessionCookie({ value: token, maxAgeSeconds: 60, secure: false }));
  assert.throws(() => serializeSessionCookie({ value: token, maxAgeSeconds: 60, sameSite: "None" }));
  assert.throws(() => serializeSessionCookie({ value: "bad", maxAgeSeconds: 60 }));
  assert.throws(() => serializeSessionCookie({ value: token, maxAgeSeconds: -1 }));
});

test("cookie parser rejects duplicate and oversized cookie headers", () => {
  assert.equal(readSessionCookie("__Host-infinite_x_session=" + token), token);
  assert.equal(readSessionCookie("__Host-infinite_x_session=" + token + "; __Host-infinite_x_session=" + token), null);
  assert.equal(readSessionCookie("x".repeat(8193)), null);
  assert.equal(readSessionCookie("__Host-infinite_x_session=bad"), null);
});

test("logout cookie expires the same host-only cookie", () => {
  const cookie = serializeExpiredSessionCookie();
  assert.match(cookie, /Max-Age=0/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
});
