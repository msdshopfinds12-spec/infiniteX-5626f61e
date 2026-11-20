import assert from "node:assert/strict";
import test from "node:test";
import { readPublicSupabaseConfig } from "./public-config.ts";

const validEnvironment = {
  VITE_SUPABASE_URL: "https://example-project.supabase.co",
  VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_public_key",
};

test("missing configuration fails closed", () => {
  assert.deepEqual(
    readPublicSupabaseConfig({
      VITE_SUPABASE_URL: undefined,
      VITE_SUPABASE_PUBLISHABLE_KEY: undefined,
    }),
    {
      status: "missing",
      missing: ["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"],
    },
  );
});

test("partial configuration reports the missing public field", () => {
  assert.deepEqual(
    readPublicSupabaseConfig({
      VITE_SUPABASE_URL: validEnvironment.VITE_SUPABASE_URL,
      VITE_SUPABASE_PUBLISHABLE_KEY: undefined,
    }),
    { status: "missing", missing: ["VITE_SUPABASE_PUBLISHABLE_KEY"] },
  );
});

test("accepts HTTPS URL and publishable key", () => {
  assert.deepEqual(readPublicSupabaseConfig(validEnvironment), {
    status: "ready",
    config: validEnvironment,
  });
});

test("accepts legacy anon JWT only when its role claim is anon", () => {
  const payload = Buffer.from(JSON.stringify({ role: "anon" })).toString("base64url");
  const key = `header.${payload}.signature`;

  assert.equal(
    readPublicSupabaseConfig({
      ...validEnvironment,
      VITE_SUPABASE_PUBLISHABLE_KEY: key,
    }).status,
    "ready",
  );
});

test("rejects service-role and secret credentials", () => {
  for (const key of ["service_role_secret", "sb_secret_do_not_expose"]) {
    const result = readPublicSupabaseConfig({
      ...validEnvironment,
      VITE_SUPABASE_PUBLISHABLE_KEY: key,
    });
    assert.deepEqual(result, { status: "invalid", reason: "invalid-key" });
  }
});

test("rejects JWT-shaped credentials with a privileged role", () => {
  const payload = Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url");
  const result = readPublicSupabaseConfig({
    ...validEnvironment,
    VITE_SUPABASE_PUBLISHABLE_KEY: `header.${payload}.signature`,
  });

  assert.deepEqual(result, { status: "invalid", reason: "invalid-key" });
});

test("requires HTTPS outside localhost", () => {
  assert.deepEqual(
    readPublicSupabaseConfig({
      ...validEnvironment,
      VITE_SUPABASE_URL: "http://example-project.supabase.co",
    }),
    { status: "invalid", reason: "insecure-url" },
  );
});

test("allows HTTP only for localhost development", () => {
  assert.equal(
    readPublicSupabaseConfig({
      ...validEnvironment,
      VITE_SUPABASE_URL: "http://localhost:54321",
    }).status,
    "ready",
  );
});

test("rejects URL credentials, paths, query strings, and fragments", () => {
  for (const url of [
    "https://user:password@example-project.supabase.co",
    "https://example-project.supabase.co/rest/v1",
    "https://example-project.supabase.co?debug=true",
    "https://example-project.supabase.co#fragment",
  ]) {
    assert.deepEqual(
      readPublicSupabaseConfig({ ...validEnvironment, VITE_SUPABASE_URL: url }),
      { status: "invalid", reason: "invalid-url" },
      url,
    );
  }
});
