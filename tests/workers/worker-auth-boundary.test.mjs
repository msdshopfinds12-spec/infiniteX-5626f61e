import test from "node:test";
import assert from "node:assert/strict";
import { authenticateBearerRequest, authenticateCronRequest } from "../../supabase/functions/_shared/worker-auth-boundary.mjs";

function env(values = {}) { return { get: (key) => values[key] }; }
function request(headers = {}) { return new Request("https://worker.test", { method: "POST", headers }); }
const completeEnv = env({
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_ANON_KEY: "public-test-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-test-key",
});

test("authenticated boundary rejects missing bearer before creating a client", async () => {
  let created = 0;
  const result = await authenticateBearerRequest({ request: request(), env: completeEnv, createClient: () => { created++; } });
  assert.deepEqual(result, { ok: false, status: 401, error: "missing_bearer_token" });
  assert.equal(created, 0);
});

test("authenticated boundary validates identity before returning owner-scoped client", async () => {
  let receivedToken;
  const result = await authenticateBearerRequest({
    request: request({ Authorization: "Bearer signed-user-token" }),
    env: completeEnv,
    createClient: (_url, _key, options) => ({
      auth: { getUser: async (token) => { receivedToken = token; return { data: { user: { id: "user-123" } }, error: null }; } },
      options,
    }),
  });
  assert.equal(result.ok, true);
  assert.equal(result.ownerId, "user-123");
  assert.equal(receivedToken, "signed-user-token");
});

test("authenticated boundary rejects invalid identity and incomplete environment", async () => {
  const invalid = await authenticateBearerRequest({
    request: request({ Authorization: "Bearer bad-token" }), env: completeEnv,
    createClient: () => ({ auth: { getUser: async () => ({ data: { user: null }, error: new Error("invalid") }) } }),
  });
  assert.deepEqual(invalid, { ok: false, status: 401, error: "invalid_session" });
  const missingEnv = await authenticateBearerRequest({
    request: request({ Authorization: "Bearer token" }), env: env(), createClient: () => assert.fail("must not create client"),
  });
  assert.deepEqual(missingEnv, { ok: false, status: 500, error: "worker_environment_incomplete" });
});

test("cron boundary rejects missing and short secrets before privileged client creation", async () => {
  let created = 0;
  for (const headers of [{}, { "x-simula-worker-secret": "short" }]) {
    const result = await authenticateCronRequest({ request: request(headers), env: completeEnv, createClient: () => { created++; } });
    assert.equal(result.ok, false);
    assert.equal(result.status, 401);
  }
  assert.equal(created, 0);
});

test("cron boundary verifies secret before exposing privileged client", async () => {
  let rpcName;
  const result = await authenticateCronRequest({
    request: request({ "x-simula-worker-secret": "s".repeat(40) }), env: completeEnv,
    createClient: () => ({ rpc: async (name) => { rpcName = name; return { data: true, error: null }; } }),
  });
  assert.equal(result.ok, true);
  assert.equal(rpcName, "simula_verify_worker_secret");
  assert.ok(result.admin);
});

test("cron boundary fails closed on invalid secret and RPC errors", async () => {
  for (const response of [{ data: false, error: null }, { data: null, error: new Error("db") }]) {
    const result = await authenticateCronRequest({
      request: request({ "x-simula-worker-secret": "s".repeat(40) }), env: completeEnv,
      createClient: () => ({ rpc: async () => response }),
    });
    assert.deepEqual(result, { ok: false, status: 401, error: "unauthorized" });
  }
});
