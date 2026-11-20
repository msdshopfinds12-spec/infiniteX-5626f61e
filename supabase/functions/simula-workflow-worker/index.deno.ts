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
const cors = (req: Request) => createCorsHeaders(req.headers.get("origin"), "");

Deno.test("authenticated HTTP handler rejects unsupported methods without creating clients", async () => {
  let clients = 0;
  const handler = createAuthenticatedWorkerHandler({
    createClient: (() => { clients++; throw new Error("unexpected client"); }) as never,
    env: configuredEnv,
    corsHeadersForRequest: cors,
    executeSafeAction: (() => { throw new Error("unexpected action"); }) as never,
  });
  const response = await handler(new Request("https://worker.test", { method: "GET" }));
  assert(response.status === 405, "expected 405 for GET");
  assert(clients === 0, "GET must not construct Supabase clients");
});

Deno.test("authenticated HTTP handler rejects invalid bearer identity before queue claim", async () => {
  const calls: string[] = [];
  const handler = createAuthenticatedWorkerHandler({
    createClient: (() => ({
      auth: { getUser: async () => { calls.push("getUser"); return { data: { user: null }, error: new Error("invalid") }; } },
      rpc: async () => { calls.push("claim"); return { data: [], error: null }; },
    })) as never,
    env: configuredEnv,
    corsHeadersForRequest: cors,
    executeSafeAction: (() => ({})) as never,
  });
  const response = await handler(new Request("https://worker.test", {
    method: "POST",
    headers: { Authorization: "Bearer invalid-token" },
    body: "{}",
  }));
  assert(response.status === 401, "expected invalid identity to return 401");
  assert(calls.join(",") === "getUser", "queue claim must not run before identity verification");
});

Deno.test("authenticated HTTP handler rejects malformed JSON before queue claim", async () => {
  const calls: string[] = [];
  const handler = createAuthenticatedWorkerHandler({
    createClient: (() => ({
      auth: { getUser: async () => ({ data: { user: { id: "owner-1" } }, error: null }) },
      rpc: async (name: string) => { calls.push(name); return { data: [], error: null }; },
    })) as never,
    env: configuredEnv,
    corsHeadersForRequest: cors,
    executeSafeAction: (() => ({})) as never,
  });
  const response = await handler(new Request("https://worker.test", {
    method: "POST",
    headers: { Authorization: "Bearer valid-token" },
    body: "{",
  }));
  assert(response.status === 400, "expected malformed JSON to return 400");
  assert(calls.length === 0, "malformed JSON must not claim queue rows");
});

Deno.test("authenticated HTTP handler returns sanitized queue claim failure", async () => {
  const calls: string[] = [];
  const handler = createAuthenticatedWorkerHandler({
    createClient: (() => ({
      auth: { getUser: async () => ({ data: { user: { id: "owner-1" } }, error: null }) },
      rpc: async (name: string) => { calls.push(name); return { data: null, error: new Error("private database detail") }; },
    })) as never,
    env: configuredEnv,
    corsHeadersForRequest: cors,
    executeSafeAction: (() => ({})) as never,
  });
  const response = await handler(new Request("https://worker.test", {
    method: "POST",
    headers: { Authorization: "Bearer valid-token" },
    body: "{}",
  }));
  const body = await response.json();
  assert(response.status === 500, "expected queue claim failure to return 500");
  assert(body.error === "queue_claim_failed", "response must not disclose database error details");
  assert(calls.join(",") === "simula_claim_workflow_runs", "expected user-scoped claim RPC");
});

Deno.test("cron HTTP handler rejects unsupported methods and missing secrets before privileged client creation", async () => {
  let clients = 0;
  const handler = createCronWorkerHandler({
    createClient: (() => { clients++; throw new Error("unexpected client"); }) as never,
    env: configuredEnv,
    executeSafeAction: (() => ({})) as never,
  });
  const methodResponse = await handler(new Request("https://worker.test", { method: "GET" }));
  const secretResponse = await handler(new Request("https://worker.test", { method: "POST", body: "{}" }));
  assert(methodResponse.status === 405, "expected GET to return 405");
  assert(secretResponse.status === 401, "expected missing cron secret to return 401");
  assert(clients === 0, "unauthorized cron requests must not create a privileged client");
});

Deno.test("cron HTTP handler verifies secret before privileged claim and sanitizes claim failure", async () => {
  const calls: string[] = [];
  const handler = createCronWorkerHandler({
    createClient: (() => ({
      rpc: async (name: string) => {
        calls.push(name);
        if (name === "simula_verify_worker_secret") return { data: true, error: null };
        return { data: null, error: new Error("private database detail") };
      },
    })) as never,
    env: configuredEnv,
    executeSafeAction: (() => ({})) as never,
  });
  const response = await handler(new Request("https://worker.test", {
    method: "POST",
    headers: { "x-simula-worker-secret": "s".repeat(40) },
    body: "{}",
  }));
  const body = await response.json();
  assert(response.status === 500, "expected claim failure to return 500");
  assert(body.error === "queue_claim_failed", "response must not disclose database error details");
  assert(calls.join(",") === "simula_verify_worker_secret,simula_claim_workflow_runs_internal", "secret verification must precede internal claim");
});

Deno.test("cron HTTP handler rejects malformed JSON after verification but before internal claim", async () => {
  const calls: string[] = [];
  const handler = createCronWorkerHandler({
    createClient: (() => ({
      rpc: async (name: string) => { calls.push(name); return { data: true, error: null }; },
    })) as never,
    env: configuredEnv,
    executeSafeAction: (() => ({})) as never,
  });
  const response = await handler(new Request("https://worker.test", {
    method: "POST",
    headers: { "x-simula-worker-secret": "s".repeat(40) },
    body: "{",
  }));
  assert(response.status === 400, "expected malformed JSON to return 400");
  assert(calls.join(",") === "simula_verify_worker_secret", "malformed JSON must not claim internal queue rows");
});
