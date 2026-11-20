import assert from "node:assert/strict";
import test from "node:test";
import { parseSupabaseBrowserConfig } from "./config.ts";

test("keeps Supabase disabled when no public config is supplied", () => {
  assert.deepEqual(parseSupabaseBrowserConfig(undefined, undefined), {
    enabled: false,
    reason: "missing-public-config",
  });
});

test("accepts HTTPS URL and a publishable key", () => {
  const result = parseSupabaseBrowserConfig(
    "https://example.supabase.co/",
    "sb_publishable_example_public_key",
  );
  assert.equal(result.enabled, true);
  if (result.enabled) {
    assert.equal(result.url, "https://example.supabase.co");
    assert.equal(result.publishableKey, "sb_publishable_example_public_key");
  }
});

test("accepts a legacy anon JWT format", () => {
  const result = parseSupabaseBrowserConfig(
    "https://example.supabase.co",
    "header.payload.signature",
  );
  assert.equal(result.enabled, true);
});

test("rejects partial configuration", () => {
  assert.throws(
    () => parseSupabaseBrowserConfig("https://example.supabase.co", undefined),
    /Incomplete Supabase browser configuration/,
  );
});

test("rejects server-only credentials", () => {
  assert.throws(
    () => parseSupabaseBrowserConfig("https://example.supabase.co", "sb_secret_do_not_expose"),
    /server-only Supabase credential/,
  );
  assert.throws(
    () => parseSupabaseBrowserConfig("https://example.supabase.co", "service_role"),
    /server-only Supabase credential/,
  );
});

test("rejects insecure non-local URLs", () => {
  assert.throws(
    () => parseSupabaseBrowserConfig("http://example.supabase.co", "sb_publishable_example"),
    /must use HTTPS/,
  );
});

test("allows HTTP only for localhost development", () => {
  const result = parseSupabaseBrowserConfig(
    "http://localhost:54321",
    "sb_publishable_example",
  );
  assert.equal(result.enabled, true);
});

test("rejects URL paths, query strings, and embedded credentials", () => {
  for (const url of [
    "https://example.supabase.co/rest/v1",
    "https://example.supabase.co?token=secret",
    "https://user:pass@example.supabase.co",
  ]) {
    assert.throws(
      () => parseSupabaseBrowserConfig(url, "sb_publishable_example"),
      /must be an origin only/,
    );
  }
});
