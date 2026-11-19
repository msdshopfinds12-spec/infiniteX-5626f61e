import test from "node:test";
import assert from "node:assert/strict";
import { createCorsHeaders } from "./cors.ts";

test("allows only an exact configured origin", () => {
  const result = createCorsHeaders("https://app.example.test", "https://app.example.test");
  assert.equal(result.allowed, true);
  assert.equal(result.headers.get("Access-Control-Allow-Origin"), "https://app.example.test");
});

test("rejects a sibling or attacker-controlled origin", () => {
  const result = createCorsHeaders("https://app.example.test.attacker.invalid", "https://app.example.test");
  assert.equal(result.allowed, false);
  assert.equal(result.headers.has("Access-Control-Allow-Origin"), false);
});

test("rejects scheme and port mismatches", () => {
  assert.equal(createCorsHeaders("http://app.example.test", "https://app.example.test").allowed, false);
  assert.equal(createCorsHeaders("https://app.example.test:444", "https://app.example.test").allowed, false);
});

test("fails closed for browser origins when configuration is empty", () => {
  const result = createCorsHeaders("https://app.example.test", "");
  assert.equal(result.allowed, false);
  assert.equal(result.headers.has("Access-Control-Allow-Origin"), false);
});

test("trims comma-separated exact origins without accepting partial matches", () => {
  const result = createCorsHeaders("https://preview.example.test", " https://app.example.test, https://preview.example.test ");
  assert.equal(result.allowed, true);
  assert.equal(result.headers.get("Access-Control-Allow-Origin"), "https://preview.example.test");
});

test("allows non-browser server requests without an Origin header but emits no ACAO header", () => {
  const result = createCorsHeaders(null, "https://app.example.test");
  assert.equal(result.allowed, true);
  assert.equal(result.headers.has("Access-Control-Allow-Origin"), false);
});
