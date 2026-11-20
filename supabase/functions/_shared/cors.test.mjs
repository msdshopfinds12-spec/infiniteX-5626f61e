import test from "node:test";
import assert from "node:assert/strict";
import { createCorsHeaders } from "./cors.ts";

const PRODUCTION_ORIGIN = "https://infinitexultra.vercel.app";

test("allows only an exact configured origin", () => {
  const result = createCorsHeaders("https://app.example.test", "https://app.example.test");
  assert.equal(result.allowed, true);
  assert.equal(result.headers.get("Access-Control-Allow-Origin"), "https://app.example.test");
});

test("InfiniteX production policy allows the canonical production origin only", () => {
  const result = createCorsHeaders(PRODUCTION_ORIGIN, PRODUCTION_ORIGIN);
  assert.equal(result.allowed, true);
  assert.equal(result.headers.get("Access-Control-Allow-Origin"), PRODUCTION_ORIGIN);
});

test("InfiniteX production policy denies Vercel Preview and other unapproved origins", () => {
  const configured = PRODUCTION_ORIGIN;
  const deniedOrigins = [
    "https://infinitexultra-git-feature-example.vercel.app",
    "https://infinitexultra-preview.vercel.app",
    "https://infinitexultra.vercel.app.attacker.invalid",
    "http://infinitexultra.vercel.app",
    "https://infinitexultra.vercel.app:444",
    "https://localhost:5173",
  ];

  for (const origin of deniedOrigins) {
    const result = createCorsHeaders(origin, configured);
    assert.equal(result.allowed, false, `expected ${origin} to be denied`);
    assert.equal(result.headers.has("Access-Control-Allow-Origin"), false);
  }
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
  const result = createCorsHeaders(null, PRODUCTION_ORIGIN);
  assert.equal(result.allowed, true);
  assert.equal(result.headers.has("Access-Control-Allow-Origin"), false);
});
