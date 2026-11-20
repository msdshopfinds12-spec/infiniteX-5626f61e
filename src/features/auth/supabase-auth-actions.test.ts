import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types.ts";
import { createSupabaseAuthSessionAdapter } from "./supabase-auth-session-adapter.ts";

function createClient(overrides: Record<string, unknown> = {}) {
  const auth = {
    getSession: async () => ({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({
      data: { subscription: { unsubscribe: () => undefined } },
    }),
    signInWithPassword: async () => ({ data: {}, error: null }),
    signUp: async () => ({ data: { session: null }, error: null }),
    resetPasswordForEmail: async () => ({ error: null }),
    updateUser: async () => ({ data: { user: { id: "synthetic-user" } }, error: null }),
    signOut: async () => ({ error: null }),
    ...overrides,
  };
  return { auth } as unknown as Pick<SupabaseClient<Database>, "auth">;
}

test("sign-in returns a safe success result without exposing SDK session data", async () => {
  const adapter = createSupabaseAuthSessionAdapter(createClient());
  assert.deepEqual(await adapter.signIn("person@example.com", "password"), {
    status: "success",
    message: "You are signed in.",
  });
});

test("sign-in maps invalid credentials to a non-enumerating message", async () => {
  const adapter = createSupabaseAuthSessionAdapter(createClient({
    signInWithPassword: async () => ({
      data: {},
      error: { status: 400, message: "Invalid login credentials" },
    }),
  }));

  assert.deepEqual(await adapter.signIn("person@example.com", "wrong-password"), {
    status: "error",
    code: "invalid-credentials",
    message: "Email or password is incorrect. Check your details and try again.",
  });
});

test("sign-up explains email confirmation when Supabase returns no session", async () => {
  const adapter = createSupabaseAuthSessionAdapter(createClient());
  const result = await adapter.signUp("person@example.com", "long-enough-password");

  assert.equal(result.status, "success");
  assert.match(result.message, /confirmation link/);
});

test("sign-out returns a safe success result", async () => {
  const adapter = createSupabaseAuthSessionAdapter(createClient());
  assert.deepEqual(await adapter.signOut(), {
    status: "success",
    message: "You have been signed out.",
  });
});

test("rate limits are mapped without exposing provider error text", async () => {
  const adapter = createSupabaseAuthSessionAdapter(createClient({
    signInWithPassword: async () => ({
      data: {},
      error: { status: 429, message: "internal provider detail" },
    }),
  }));

  const result = await adapter.signIn("person@example.com", "password");
  assert.deepEqual(result, {
    status: "error",
    code: "rate-limited",
    message: "Too many attempts. Please wait a moment before trying again.",
  });
});

test("network exceptions are normalized without exposing exception details", async () => {
  const adapter = createSupabaseAuthSessionAdapter(createClient({
    signInWithPassword: async () => {
      throw new Error("Failed to fetch internal endpoint details");
    },
  }));

  assert.deepEqual(await adapter.signIn("person@example.com", "password"), {
    status: "error",
    code: "network",
    message: "Unable to reach the authentication service. Check your connection and retry.",
  });
});

test("sign-out exceptions are returned as safe results rather than escaping", async () => {
  const adapter = createSupabaseAuthSessionAdapter(createClient({
    signOut: async () => {
      throw new Error("internal provider failure");
    },
  }));

  const result = await adapter.signOut();
  assert.equal(result.status, "error");
  assert.equal(result.code, "unknown");
  assert.doesNotMatch(result.message, /internal provider failure/);
});

test("password reset returns the same non-enumerating success message", async () => {
  const adapter = createSupabaseAuthSessionAdapter(createClient());
  assert.deepEqual(
    await adapter.requestPasswordReset("person@example.com", "https://example.test/?auth=recovery"),
    {
      status: "success",
      message: "If an account exists for that email, a password reset link will be sent.",
    },
  );
});

test("password reset never exposes provider error details", async () => {
  const adapter = createSupabaseAuthSessionAdapter(createClient({
    resetPasswordForEmail: async () => ({
      error: { status: 429, message: "private provider details" },
    }),
  }));
  const result = await adapter.requestPasswordReset("person@example.com", "https://example.test/?auth=recovery");
  assert.equal(result.status, "error");
  assert.equal(result.code, "rate-limited");
  assert.doesNotMatch(result.message, /private provider details/);
});

test("password update returns a safe success result", async () => {
  const adapter = createSupabaseAuthSessionAdapter(createClient());
  assert.deepEqual(await adapter.updatePassword("new-strong-password"), {
    status: "success",
    message: "Your password has been updated. You can continue to your workspace.",
  });
});
