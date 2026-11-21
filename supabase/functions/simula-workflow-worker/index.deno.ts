import { createAuthenticatedWorkerHandler } from "../simula-workflow-worker/index.ts";
import { createCronWorkerHandler } from "../simula-workflow-cron-worker/index.ts";
import { createCorsHeaders } from "../_shared/cors.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function env(values: Record<string, string> = {}) {
  return { get: (key: string) => values[key] };
}
const configuredEnv = env({
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "test-publishable-key",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
});
const ownerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const runId = "11111111-1111-4111-8111-111111111111";
const workflowId = "22222222-2222-4222-8222-222222222222";
const stepId = "33333333-3333-4333-8333-333333333333";
const leaseToken = "44444444-4444-4444-8444-444444444444";
const stepRunId = "55555555-5555-4555-8555-555555555555";
const outboxId = "66666666-6666-4666-8666-666666666666";
const cors = (req: Request) => createCorsHeaders(req.headers.get("origin"), "");

type Row = Record<string, unknown>;
type RpcCall = { name: string; args: Record<string, unknown> };

function fakeAdmin(options: {
  rpc?: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown | null }>;
  calls: RpcCall[];
}) {
  const workflow = { id: workflowId, owner_id: ownerId, status: "active" };
  const steps = [{
    id: stepId, step_order: 1, name: "pass-through", action_type: "pass_through",
    config: {}, retry_limit: 0, timeout_seconds: 30,
  }];
  return {
    rpc: async (name: string, args: Record<string, unknown>) => {
      options.calls.push({ name, args });
      if (options.rpc) return await options.rpc(name, args);
      if (name === "simula_claim_workflow_runs_lease_internal") {
        return { data: [{
          id: runId, workflow_id: workflowId, owner_id: ownerId, input: { seed: true },
          attempt: 1, lease_token: leaseToken, lease_until: new Date(Date.now() + 90_000).toISOString(),
        }], error: null };
      }
      if (name === "simula_start_workflow_step_with_lease") {
        return { data: [{ step_run_id: stepRunId, replayed: false }], error: null };
      }
      if (name === "simula_complete_step_with_outbox_lease") {
        return { data: [{ step_run_id: stepRunId, outbox_id: outboxId, replayed: false }], error: null };
      }
      if (name === "simula_finish_workflow_run_lease") {
        return { data: [{ id: runId, status: args.p_terminal_status, attempt: 1 }], error: null };
      }
      if (name === "simula_fail_workflow_step_with_lease") {
        return { data: [{ step_run_id: stepRunId }], error: null };
      }
      return { data: null, error: new Error("unexpected_rpc:" + name) };
    },
    from(table: string) {
      const builder: any = {
        select() { return builder; },
        eq() { return builder; },
        order() { return builder; },
        maybeSingle: async () => ({
          data: table === "workflows" ? workflow : null,
          error: null,
        }),
        insert: async (_row: Row) => ({ data: null, error: null }),
        then(resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) {
          const data = table === "workflow_steps" ? steps : [];
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        },
      };
      return builder;
    },
  };
}

function handlerWith(options: {
  calls: RpcCall[];
  rpc?: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown | null }>;
  authOk?: boolean;
}) {
  const admin = fakeAdmin(options);
  const clientOrder: string[] = [];
  const handler = createAuthenticatedWorkerHandler({
    createClient: ((url: string, key: string) => {
      clientOrder.push(key);
      if (key === "test-publishable-key") {
        return {
          auth: { getUser: async () => options.authOk === false
            ? { data: { user: null }, error: new Error("invalid") }
            : { data: { user: { id: ownerId } }, error: null } },
        };
      }
      return admin;
    }) as never,
    env: configuredEnv,
    corsHeadersForRequest: cors,
    executeSafeAction: ((type: string, input: unknown) => type === "pass_through" ? input : {}) as never,
  });
  return { handler, clientOrder };
}

Deno.test("authenticated handler rejects unsupported methods without creating clients", async () => {
  let clients = 0;
  const handler = createAuthenticatedWorkerHandler({
    createClient: (() => { clients++; throw new Error("unexpected client"); }) as never,
    env: configuredEnv, corsHeadersForRequest: cors,
    executeSafeAction: (() => ({})) as never,
  });
  const response = await handler(new Request("https://worker.test", { method: "GET" }));
  assert(response.status === 405 && clients === 0, "GET must return 405 before client creation");
});

Deno.test("authenticated handler rejects invalid bearer identity before service-role client and claim", async () => {
  const calls: RpcCall[] = [];
  const { handler, clientOrder } = handlerWith({ calls, authOk: false });
  const response = await handler(new Request("https://worker.test", {
    method: "POST", headers: { Authorization: "Bearer invalid-token" }, body: "{}",
  }));
  assert(response.status === 401, "invalid identity returns 401");
  assert(clientOrder.length === 1 && calls.length === 0, "invalid identity must not create admin client or claim");
});

Deno.test("authenticated handler rejects malformed JSON before privileged client creation", async () => {
  const calls: RpcCall[] = [];
  const { handler, clientOrder } = handlerWith({ calls });
  const response = await handler(new Request("https://worker.test", {
    method: "POST", headers: { Authorization: "Bearer valid-token" }, body: "{",
  }));
  assert(response.status === 400, "malformed JSON returns 400");
  assert(clientOrder.length === 1 && calls.length === 0, "malformed JSON must not create admin client or claim");
});

Deno.test("authenticated worker completes a run only through owner-scoped fenced RPCs", async () => {
  const calls: RpcCall[] = [];
  const { handler, clientOrder } = handlerWith({ calls });
  const response = await handler(new Request("https://worker.test", {
    method: "POST", headers: { Authorization: "Bearer valid-token" }, body: JSON.stringify({ limit: 1 }),
  }));
  const body = await response.json();
  assert(response.status === 200 && body.succeeded === 1, "synthetic run should succeed");
  assert(clientOrder.join(",") === "test-publishable-key,test-service-role-key",
    "service-role client must be created only after bearer verification");
  const names = calls.map((call) => call.name);
  assert(names.join(",") === [
    "simula_claim_workflow_runs_lease_internal",
    "simula_start_workflow_step_with_lease",
    "simula_complete_step_with_outbox_lease",
    "simula_finish_workflow_run_lease",
  ].join(","), "all lifecycle changes use fenced RPCs");
  for (const call of calls) {
    if (call.name !== "simula_claim_workflow_runs_lease_internal") {
      assert(call.args.p_owner_id === ownerId && call.args.p_run_id === runId &&
        call.args.p_attempt === 1 && call.args.p_lease_token === leaseToken,
      "every transition must carry the exact lease identity");
    } else {
      assert(call.args.p_owner_id === ownerId, "claim is scoped to authenticated owner");
    }
  }
});

Deno.test("ambiguous step-start transport outcome never triggers unfenced failure or finish", async () => {
  const calls: RpcCall[] = [];
  const { handler } = handlerWith({
    calls,
    rpc: async (name, args) => {
      if (name === "simula_claim_workflow_runs_lease_internal") {
        return { data: [{
          id: runId, workflow_id: workflowId, owner_id: ownerId, input: {},
          attempt: 1, lease_token: leaseToken, lease_until: new Date(Date.now() + 90_000).toISOString(),
        }], error: null };
      }
      if (name === "simula_start_workflow_step_with_lease") throw new Error("socket closed after request");
      return { data: null, error: new Error("unexpected follow-up mutation") };
    },
  });
  const response = await handler(new Request("https://worker.test", {
    method: "POST", headers: { Authorization: "Bearer valid-token" }, body: "{}",
  }));
  const body = await response.json();
  const names = calls.map((call) => call.name);
  assert(response.status === 200 && body.lease_lost === 1, "ambiguous lease outcome is reported");
  assert(names.join(",") === "simula_claim_workflow_runs_lease_internal,simula_start_workflow_step_with_lease",
    "no retry, fail-step, or finish mutation follows ambiguous start");
});

Deno.test("cron handler still verifies secret before internal claim during Phase 103.4", async () => {
  const calls: string[] = [];
  const handler = createCronWorkerHandler({
    createClient: (() => ({
      rpc: async (name: string) => {
        calls.push(name);
        return name === "simula_verify_worker_secret"
          ? { data: true, error: null }
          : { data: [], error: null };
      },
    })) as never,
    env: configuredEnv,
    executeSafeAction: (() => ({})) as never,
  });
  const response = await handler(new Request("https://worker.test", {
    method: "POST", headers: { "x-simula-worker-secret": "s".repeat(40) }, body: "{}",
  }));
  assert(response.status === 200, "valid cron secret allows an empty synthetic claim");
  assert(calls.join(",") === "simula_verify_worker_secret,simula_claim_workflow_runs_internal",
    "cron secret verification precedes claim");
});
