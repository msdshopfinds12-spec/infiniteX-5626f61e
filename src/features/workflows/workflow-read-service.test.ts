import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types.ts";
import { createWorkflowReadService } from "./workflow-read-service.ts";

function createClient(result: unknown, shouldThrow = false) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const builder = {
    select(columns: string) { calls.push({ method: "select", args: [columns] }); return this; },
    eq(column: string, value: unknown) { calls.push({ method: "eq", args: [column, value] }); return this; },
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

test("workflow run history uses safe columns, workflow filter, newest-first ordering, and bounded limit", async () => {
  const run = {
    id: "run-1",
    workflow_id: "workflow-1",
    status: "succeeded",
    created_at: "2026-11-21T00:00:00.000Z",
    started_at: "2026-11-21T00:00:01.000Z",
    finished_at: "2026-11-21T00:00:02.000Z",
    attempt: 1,
  };
  const { client, calls } = createClient({ data: [run], error: null });
  const result = await createWorkflowReadService(client).listWorkflowRuns(" workflow-1 ", { limit: 8 });
  assert.equal(result.status, "success");
  if (result.status === "success") assert.deepEqual(result.data, [run]);
  assert.deepEqual(calls, [
    { method: "from", args: ["workflow_runs"] },
    { method: "select", args: ["id,workflow_id,status,created_at,started_at,finished_at,attempt"] },
    { method: "eq", args: ["workflow_id", "workflow-1"] },
    { method: "order", args: ["created_at", { ascending: false }] },
    { method: "limit", args: [8] },
  ]);
  assert.equal(calls.some(call => call.args.join(",").includes("owner_id")), false);
  assert.equal(calls.some(call => call.args.join(",").includes("output")), false);
  assert.equal(calls.some(call => call.args.join(",").includes("error_message")), false);
});

test("workflow run history rejects blank workflow IDs without querying", async () => {
  const { client, calls } = createClient({ data: [], error: null });
  assert.deepEqual(
    await createWorkflowReadService(client).listWorkflowRuns("   "),
    { status: "error", code: "invalid_workflow_id" },
  );
  assert.deepEqual(calls, []);
});

test("workflow run history normalizes database errors and validates its limit", async () => {
  const { client, calls } = createClient({ data: null, error: { message: "private run details" } });
  const service = createWorkflowReadService(client);
  assert.deepEqual(await service.listWorkflowRuns("workflow-1"), {
    status: "error",
    code: "query_failed",
  });
  assert.deepEqual(await service.listWorkflowRuns("workflow-1", { limit: 101 }), {
    status: "error",
    code: "invalid_limit",
  });
  assert.equal(calls.length, 5);
});

test("workflow read service does not accept a caller-supplied owner identity", () => {
  const { client } = createClient({ data: [], error: null });
  const service = createWorkflowReadService(client);
  assert.deepEqual(Object.keys(service).sort(), ["listOwnWorkflows", "listWorkflowRuns"].sort());
});
