import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types.ts";
import { createProjectReadService } from "./project-read-service.ts";

function createClient(result: unknown, shouldThrow = false) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const builder = {
    select(columns: string) { calls.push({ method: "select", args: [columns] }); return this; },
    order(column: string, options: unknown) { calls.push({ method: "order", args: [column, options] }); return this; },
    limit(value: number) { calls.push({ method: "limit", args: [value] }); return this; },
    then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
      if (shouldThrow) return Promise.reject(new Error("private network detail")).then(resolve, reject);
      return Promise.resolve(result).then(resolve, reject);
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
  id: "project-1",
  title: "Synthetic project",
  project_type: "workflow",
  created_at: "2026-11-20T00:00:00.000Z",
  updated_at: "2026-11-21T00:00:00.000Z",
};

test("project service selects safe metadata only and relies on RLS for ownership", async () => {
  const { client, calls } = createClient({ data: [sample], error: null });
  const result = await createProjectReadService(client).listOwnProjects({ limit: 25 });
  assert.deepEqual(result, { status: "success", data: [sample] });
  assert.deepEqual(calls, [
    { method: "from", args: ["user_projects"] },
    { method: "select", args: ["id,title,project_type,created_at,updated_at"] },
    { method: "order", args: ["updated_at", { ascending: false }] },
    { method: "limit", args: [25] },
  ]);
  assert.equal(calls.some(call => call.args.join(",").includes("content")), false);
  assert.equal(calls.some(call => call.args.join(",").includes("user_id")), false);
});

test("project service handles an empty project list", async () => {
  const { client } = createClient({ data: null, error: null });
  assert.deepEqual(await createProjectReadService(client).listOwnProjects(), {
    status: "success",
    data: [],
  });
});

test("project service validates bounded limits before querying", async () => {
  const { client, calls } = createClient({ data: [], error: null });
  const service = createProjectReadService(client);
  for (const limit of [0, -1, 101, 1.5, Number.NaN]) {
    assert.deepEqual(await service.listOwnProjects({ limit }), {
      status: "error",
      code: "invalid_limit",
    });
  }
  assert.deepEqual(calls, []);
});

test("project service normalizes provider errors", async () => {
  const { client } = createClient({ data: null, error: { message: "private SQL detail" } });
  const result = await createProjectReadService(client).listOwnProjects();
  assert.deepEqual(result, { status: "error", code: "query_failed" });
  assert.doesNotMatch(JSON.stringify(result), /private SQL detail/);
});

test("project service normalizes network exceptions", async () => {
  const { client } = createClient(null, true);
  assert.deepEqual(await createProjectReadService(client).listOwnProjects(), {
    status: "error",
    code: "network_unavailable",
  });
});
