import test from "node:test";
import assert from "node:assert/strict";
import { readPublicSupabaseConfig } from "../src/lib/supabase/public-config.ts";

const validEnvironment = {
  VITE_SUPABASE_URL: "https://example-project.supabase.co",
  VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
};

const encodeBase64Url = (value) =>
  btoa(JSON.stringify(value)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

const legacyAnonJwt = `eyJhbGciOiJIUzI1NiJ9.${encodeBase64Url({ role: "anon" })}.signature`;
const legacyServiceRoleJwt = `eyJhbGciOiJIUzI1NiJ9.${encodeBase64Url({ role: "service_role" })}.signature`;

test("accepts HTTPS project URL and a publishable key", () => {
  assert.deepEqual(readPublicSupabaseConfig(validEnvironment), {
    status: "ready",
    config: {
      url: "https://example-project.supabase.co",
      publishableKey: "sb_publishable_example",
    },
  });
});

test("accepts a legacy JWT only when its role claim is anon", () => {
  const result = readPublicSupabaseConfig({
    ...validEnvironment,
    VITE_SUPABASE_PUBLISHABLE_KEY: legacyAnonJwt,
  });
  assert.equal(result.status, "ready");
});

test("rejects legacy service_role JWTs", () => {
  assert.deepEqual(
    readPublicSupabaseConfig({
      ...validEnvironment,
      VITE_SUPABASE_PUBLISHABLE_KEY: legacyServiceRoleJwt,
    }),
    { status: "invalid", reason: "invalid-key" },
  );
});

test("rejects arbitrary JWTs and malformed key strings", () => {
  for (const key of ["header.payload.signature", "not-a-supabase-key", "sb_publishable_"]) {
    assert.deepEqual(
      readPublicSupabaseConfig({
        ...validEnvironment,
        VITE_SUPABASE_PUBLISHABLE_KEY: key,
      }),
      { status: "invalid", reason: "invalid-key" },
    );
  }
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
