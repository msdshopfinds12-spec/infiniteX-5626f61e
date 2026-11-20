import { createClient } from "npm:@supabase/supabase-js@2.119.2";
import { createWorkflowRunRequestHandler } from "../../supabase/functions/simula-workflow-run-request/index.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function required(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error("Missing Phase 84 environment value: " + name);
  return value;
}

const postgrestFetch: typeof fetch = (input, init) => {
  const source = input instanceof Request ? input.url : input instanceof URL ? input.href : input;
  const target = new URL(source);
  if (target.pathname === "/rest/v1") target.pathname = "/";
  else if (target.pathname.startsWith("/rest/v1/")) target.pathname = target.pathname.slice("/rest/v1".length);
  if (input instanceof Request) return fetch(new Request(target, input));
  return fetch(target, init);
};

const createPostgrestClient = ((
  projectUrl: string,
  apiKey: string,
  options?: Parameters<typeof createClient>[2],
) => createClient(projectUrl, apiKey, {
  ...(options ?? {}),
  global: { ...(options?.global ?? {}), fetch: postgrestFetch },
})) as typeof createClient;

Deno.test({
  name: "Phase 84: authenticated enqueue endpoint enforces ownership, idempotency, and safe queued defaults",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const url = required("PHASE81_POSTGREST_URL");
    const tokenA = required("PHASE81_USER_JWT");
    const tokenB = required("PHASE81_USER_B_JWT");
    const ownerA = required("PHASE81_USER_ID");
    const ownerB = required("PHASE81_USER_B_ID");
    const serviceJwt = required("PHASE81_SERVICE_JWT");
    const workflowA = "81000000-1000-4000-8000-000000000001";
    const workflowB = "81000000-1000-4000-8000-000000000002";
    const requestA = "84000000-3000-4000-8000-000000000001";
    const requestB = "84000000-3000-4000-8000-000000000002";

    const clientA = createPostgrestClient(url, "phase84-anon", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: "Bearer " + tokenA }, fetch: postgrestFetch },
    });
    const clientB = createPostgrestClient(url, "phase84-anon", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: "Bearer " + tokenB }, fetch: postgrestFetch },
    });
    const admin = createPostgrestClient(url, serviceJwt, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: "Bearer " + serviceJwt }, fetch: postgrestFetch },
    });

    const handler = createWorkflowRunRequestHandler({
      createClient: createPostgrestClient as never,
      env: { get: (name) => name === "SUPABASE_URL" ? url : name === "SUPABASE_PUBLISHABLE_KEY" ? "phase84-anon" : undefined },
      corsHeadersForRequest: (() => ({ allowed: true, headers: {} })) as never,
      authenticate: async ({ request }) => {
        const bearer = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
        if (bearer === tokenA) return { ok: true as const, userClient: clientA, ownerId: ownerA };
        if (bearer === tokenB) return { ok: true as const, userClient: clientB, ownerId: ownerB };
        return { ok: false as const, status: 401, error: "invalid_session" };
      },
    });

    const port = 8082;
    const server = Deno.serve({ hostname: "127.0.0.1", port, onListen() {} }, handler);
    const endpoint = "http://127.0.0.1:" + port + "/functions/v1/simula-workflow-run-request";
    const send = (token: string, body: unknown) => fetch(endpoint, {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    try {
      const first = await send(tokenA, {
        workflow_id: workflowA,
        request_id: requestA,
        input: { phase84: "idempotent-enqueue" },
      });
      const firstBody = await first.json();
      assert(first.status === 201, "first enqueue must return 201; got " + first.status);
      assert(firstBody.ok === true && firstBody.run?.id === requestA, "first enqueue must return the requested idempotency ID");
      assert(firstBody.run.status === "queued" && firstBody.run.replayed === false, "new run must be queued and not replayed");

      const replay = await send(tokenA, {
        workflow_id: workflowA,
        request_id: requestA,
        input: { phase84: "idempotent-enqueue" },
      });
      const replayBody = await replay.json();
      assert(replay.status === 200 && replayBody.run?.replayed === true, "same request must return an idempotent replay");

      const conflict = await send(tokenA, {
        workflow_id: workflowA,
        request_id: requestA,
        input: { phase84: "different-payload" },
      });
      assert(conflict.status === 409, "same request ID with different input must return 409");

      const crossTenant = await send(tokenA, {
        workflow_id: workflowB,
        request_id: "84000000-3000-4000-8000-000000000003",
        input: {},
      });
      assert(crossTenant.status === 404, "owner A must not enqueue owner B workflow");

      const forgedOwner = await send(tokenA, {
        workflow_id: workflowA,
        request_id: "84000000-3000-4000-8000-000000000004",
        owner_id: ownerB,
        input: {},
      });
      assert(forgedOwner.status === 400, "request must reject caller-supplied owner_id");

      const oversized = await send(tokenA, {
        workflow_id: workflowA,
        request_id: "84000000-3000-4000-8000-000000000005",
        input: { payload: "x".repeat(16500) },
      });
      assert(oversized.status === 413, "oversized workflow input must be rejected");

      const secondTenant = await send(tokenB, {
        workflow_id: workflowB,
        request_id: requestB,
        input: { tenant: "B" },
      });
      assert(secondTenant.status === 201, "owner B must be able to enqueue its own workflow");

      const { data: persisted, error } = await admin
        .from("workflow_runs")
        .select("id,workflow_id,owner_id,input,status,attempt,output,error_message,started_at,finished_at")
        .eq("id", requestA)
        .single();
      assert(!error && persisted, "enqueued row must be persisted in PostgreSQL");
      assert(persisted.owner_id === ownerA && persisted.workflow_id === workflowA, "database must derive owner A and validate workflow ownership");
      assert(persisted.status === "queued" && persisted.attempt === 0, "new run must have safe queued lifecycle defaults");
      assert(persisted.output === null && persisted.error_message === null && persisted.started_at === null && persisted.finished_at === null, "worker-managed fields must remain unset at creation");
      assert(persisted.input?.phase84 === "idempotent-enqueue", "input must be persisted unchanged");

      const { data: duplicateRows, error: duplicateError } = await admin
        .from("workflow_runs")
        .select("id")
        .eq("id", requestA);
      assert(!duplicateError && duplicateRows?.length === 1, "idempotent retry must not create duplicate run rows");
    } finally {
      await server.shutdown();
    }
  },
});
