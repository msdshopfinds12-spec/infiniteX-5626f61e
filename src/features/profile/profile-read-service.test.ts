import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types.ts";
import { createProfileReadService } from "./profile-read-service.ts";

function createClient(result: unknown, shouldThrow = false) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const builder = {
    select(columns: string) { calls.push({ method: "select", args: [columns] }); return this; },
    maybeSingle() {
      calls.push({ method: "maybeSingle", args: [] });
      if (shouldThrow) return Promise.reject(new Error("private network detail"));
      return Promise.resolve(result);
    },
  };
  const client = {
    from(table: string) {
      calls.push({ method: "from", args: [table] });
      return builder;
    },
  };
  return { client: client as unknown as Pick<SupabaseClient<Database>, "from">, calls };
}

const sample = {
  display_name: "Synthetic User",
  avatar_url: null,
  created_at: "2026-11-20T00:00:00.000Z",
  updated_at: "2026-11-21T00:00:00.000Z",
};

test("profile service queries only safe own-profile columns and relies on RLS for identity", async () => {
  const { client, calls } = createClient({ data: sample, error: null });
  const result = await createProfileReadService(client).getOwnProfile();
  assert.deepEqual(result, { status: "success", data: sample });
  assert.deepEqual(calls, [
    { method: "from", args: ["profiles"] },
    { method: "select", args: ["display_name,avatar_url,created_at,updated_at"] },
    { method: "maybeSingle", args: [] },
  ]);
  assert.equal(calls.some(call => call.args.join(",").includes("role")), false);
  assert.equal(calls.some(call => call.args.join(",").includes("email")), false);
});

test("profile service represents a missing profile as a successful empty result", async () => {
  const { client } = createClient({ data: null, error: null });
  assert.deepEqual(await createProfileReadService(client).getOwnProfile(), {
    status: "success",
    data: null,
  });
});

test("profile service does not accept or query a caller-supplied identity", async () => {
  const { client, calls } = createClient({ data: sample, error: null });
  const service = createProfileReadService(client);
  assert.equal(service.getOwnProfile.length, 0);
  await service.getOwnProfile();
  assert.deepEqual(calls, [
    { method: "from", args: ["profiles"] },
    { method: "select", args: ["display_name,avatar_url,created_at,updated_at"] },
    { method: "maybeSingle", args: [] },
  ]);
  assert.equal(calls.some(call => call.method === "eq"), false);
});

test("profile service normalizes database errors without exposing provider details", async () => {
  const { client } = createClient({ data: null, error: { message: "private SQL detail" } });
  const result = await createProfileReadService(client).getOwnProfile();
  assert.deepEqual(result, { status: "error", code: "query_failed" });
  assert.doesNotMatch(JSON.stringify(result), /private SQL detail/);
});

test("profile service normalizes network exceptions", async () => {
  const { client } = createClient(null, true);
  assert.deepEqual(await createProfileReadService(client).getOwnProfile(), {
    status: "error",
    code: "network_unavailable",
  });
});
