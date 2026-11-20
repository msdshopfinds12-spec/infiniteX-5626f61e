import test from "node:test";
import assert from "node:assert/strict";
import { readPublicSupabaseConfig } from "../src/lib/supabase/public-config.ts";

const validEnvironment = {
  VITE_SUPABASE_URL: "https://example-project.supabase.co",
  VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
};

test("accepts HTTPS project URL and publishable key", () => {
  assert.deepEqual(readPublicSupabaseConfig(validEnvironment), {
    status: "ready",
    config: {
      url: "https://example-project.supabase.co",
      publishableKey: "sb_publishable_example",
    },
  });
});

test("accepts legacy anon JWT format as a public browser key", () => {
  const result = readPublicSupabaseConfig({
    ...validEnvironment,
    VITE_SUPABASE_PUBLISHABLE_KEY: "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.signature",
  });
  assert.equal(result.status, "ready");
});

test("reports missing public configuration without throwing", () => {
  assert.deepEqual(
    readPublicSupabaseConfig({
      VITE_SUPABASE_URL: "",
      VITE_SUPABASE_PUBLISHABLE_KEY: undefined,
    }),
    {
      status: "missing",
      missing: ["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"],
    },
  );
});

test("rejects malformed project URLs", () => {
  assert.deepEqual(
    readPublicSupabaseConfig({
      ...validEnvironment,
      VITE_SUPABASE_URL: "not-a-url",
    }),
    { status: "invalid", reason: "invalid-url" },
  );
});

test("rejects insecure non-local project URLs", () => {
  assert.deepEqual(
    readPublicSupabaseConfig({
      ...validEnvironment,
      VITE_SUPABASE_URL: "http://example-project.supabase.co",
    }),
    { status: "invalid", reason: "insecure-url" },
  );
});

test("allows HTTP only for localhost development", () => {
  const result = readPublicSupabaseConfig({
    ...validEnvironment,
    VITE_SUPABASE_URL: "http://localhost:54321/",
  });
  assert.equal(result.status, "ready");
  if (result.status === "ready") assert.equal(result.config.url, "http://localhost:54321");
});

test("rejects URL credentials, query strings, fragments, and paths", () => {
  for (const url of [
    "https://user:password@example-project.supabase.co",
    "https://example-project.supabase.co?token=abc",
    "https://example-project.supabase.co#fragment",
    "https://example-project.supabase.co/custom-path",
  ]) {
    const result = readPublicSupabaseConfig({
      ...validEnvironment,
      VITE_SUPABASE_URL: url,
    });
    assert.deepEqual(result, { status: "invalid", reason: "invalid-url" });
  }
});

test("rejects known privileged key formats", () => {
  for (const key of [
    "sb_secret_do_not_ship",
    "service_role_do_not_ship",
    "service-role-do-not-ship",
    "secret_key_do_not_ship",
  ]) {
    const result = readPublicSupabaseConfig({
      ...validEnvironment,
      VITE_SUPABASE_PUBLISHABLE_KEY: key,
    });
    assert.deepEqual(result, { status: "invalid", reason: "invalid-key" });
  }
});
