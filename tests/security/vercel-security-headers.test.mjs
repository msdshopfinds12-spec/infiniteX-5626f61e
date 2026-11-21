import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const config = JSON.parse(await readFile(new URL("../../vercel.json", import.meta.url), "utf8"));

test("Vercel applies baseline security headers to every route", () => {
  assert.equal(Array.isArray(config.headers), true);
  const globalRule = config.headers.find((rule) => rule.source === "/(.*)");
  assert.ok(globalRule, "global response-header rule is required");
  const headers = new Map(globalRule.headers.map(({ key, value }) => [key.toLowerCase(), value]));

  assert.equal(headers.get("x-content-type-options"), "nosniff");
  assert.equal(headers.get("x-frame-options"), "DENY");
  assert.equal(headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.equal(headers.get("permissions-policy"), "camera=(), microphone=(), geolocation=()");
  assert.equal(headers.get("x-permitted-cross-domain-policies"), "none");
});

test("HSTS requires HTTPS for one year without an unreviewed preload declaration", () => {
  const globalRule = config.headers.find((rule) => rule.source === "/(.*)");
  const hsts = globalRule.headers.find(({ key }) => key.toLowerCase() === "strict-transport-security");
  assert.ok(hsts, "HSTS header is required");
  assert.match(hsts.value, /^max-age=31536000; includeSubDomains$/);
  assert.doesNotMatch(hsts.value, /preload/i);
});

test("security header configuration contains no wildcard origin or CSP bypass", () => {
  const serialized = JSON.stringify(config);
  assert.doesNotMatch(serialized, /Access-Control-Allow-Origin|\*|unsafe-eval/i);
});
