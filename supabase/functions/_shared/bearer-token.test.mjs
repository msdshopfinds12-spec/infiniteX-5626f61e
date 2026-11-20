import assert from "node:assert/strict";
import test from "node:test";
import { parseBearerToken } from "./bearer-token.mjs";

test("parses standard bearer authorization headers", () => {
  assert.equal(parseBearerToken("Bearer eyJhbGciOi.test.signature"), "eyJhbGciOi.test.signature");
  assert.equal(parseBearerToken("bearer abc123"), "abc123");
  assert.equal(parseBearerToken("  Bearer   token-value  "), "token-value");
});

test("rejects missing, malformed, or ambiguous authorization headers", () => {
  for (const value of [null, undefined, "", "Bearer", "Bearer ", "Basic abc", "Bearer one two", "Bearer\\sabc"]) {
    assert.equal(parseBearerToken(value), null, String(value));
  }
});
