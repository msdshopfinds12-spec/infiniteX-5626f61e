import assert from "node:assert/strict";
import test from "node:test";
import { createPasswordRecoveryRedirect, normalizeEmail, validateEmail, validatePassword } from "./auth-actions.ts";

test("normalizes email whitespace and casing", () => {
  assert.equal(normalizeEmail("  USER@Example.COM  "), "user@example.com");
});

test("rejects malformed and oversized email values", () => {
  assert.ok(validateEmail("not-an-email"));
  assert.ok(validateEmail(`${"a".repeat(250)}@example.com`));
  assert.equal(validateEmail("person@example.com"), null);
});

test("requires strong-enough new passwords and enforces a maximum", () => {
  assert.ok(validatePassword("short", 8));
  assert.equal(validatePassword("long-enough-password", 8), null);
  assert.ok(validatePassword("x".repeat(129), 8));
});

test("does not apply the new-account minimum to legacy sign-in passwords", () => {
  assert.equal(validatePassword("oldpass", 1), null);
});

test("builds a same-origin password recovery callback URL", () => {
  assert.equal(
    createPasswordRecoveryRedirect("https://infinitex.example"),
    "https://infinitex.example/?auth=recovery",
  );
});

test("rejects insecure non-localhost password recovery origins", () => {
  assert.throws(() => createPasswordRecoveryRedirect("http://infinitex.example"));
  assert.equal(
    createPasswordRecoveryRedirect("http://localhost:5173"),
    "http://localhost:5173/?auth=recovery",
  );
});


test("allows explicit IPv4 and IPv6 loopback origins for local recovery", () => {
  assert.equal(
    createPasswordRecoveryRedirect("http://127.0.0.1:4174"),
    "http://127.0.0.1:4174/?auth=recovery",
  );
  assert.equal(
    createPasswordRecoveryRedirect("http://[::1]:4174"),
    "http://[::1]:4174/?auth=recovery",
  );
});
