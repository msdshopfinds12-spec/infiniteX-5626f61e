import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types.ts";
import { createWorkflowReadService } from "./workflow-read-service.ts";

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
  id: "workflow-1",
  name: "Synthetic workflow",
  description: "A test workflow",
  status: "active",
  trigger_type: "manual",
  created_at: "2026-11-20T00:00:00.000Z",
  updated_at: "2026-11-21T00:00:00.000Z",
};

test("workflow read service uses an explicit safe projection and bounded newest-first query", async () => {
  const { client, calls } = createClient({ data: [sample], error: null });
  const result = await createWorkflowReadService(client).listOwnWorkflows({ limit: 25 });

  assert.equal(result.status, "success");
  if (result.status === "success") assert.deepEqual(result.data, [sample]);
  assert.deepEqual(calls, [
    { method: "from", args: ["workflows"] },
    { method: "select", args: ["id,name,description,status,trigger_type,created_at,updated_at"] },
    { method: "order", args: ["updated_at", { ascending: false }] },
    { method: "limit", args: [25] },
  ]);
  assert.equal(calls.some(call => call.args.join(",").includes("owner_id")), false);
});

test("workflow read service treats an empty result as a successful empty state", async () => {
  const { client } = createClient({ data: [], error: null });
  const result = await createWorkflowReadService(client).listOwnWorkflows();
  assert.deepEqual(result, { status: "success", data: [] });
});

test("workflow read service normalizes database errors without exposing provider details", async () => {
  const { client } = createClient({ data: null, error: { message: "private SQL detail" } });
  const result = await createWorkflowReadService(client).listOwnWorkflows();
  assert.deepEqual(result, { status: "error", code: "query_failed" });
  assert.doesNotMatch(JSON.stringify(result), /private SQL detail/);
});

test("workflow read service normalizes network exceptions", async () => {
  const { client } = createClient(null, true);
  assert.deepEqual(
    await createWorkflowReadService(client).listOwnWorkflows(),
    { status: "error", code: "network_unavailable" },
  );
});

test("workflow read service rejects invalid page limits before querying", async () => {
  const { client, calls } = createClient({ data: [], error: null });
  const service = createWorkflowReadService(client);
  for (const limit of [0, -1, 101, 1.5, Number.NaN]) {
    assert.deepEqual(await service.listOwnWorkflows({ limit }), {
      status: "error",
      code: "invalid_limit",
    });
  }
  assert.deepEqual(calls, []);
});

test("workflow read service does not accept a caller-supplied owner identity", () => {
  const { client } = createClient({ data: [], error: null });
  const service = createWorkflowReadService(client);
  assert.deepEqual(Object.keys(service), ["listOwnWorkflows"]);
});
