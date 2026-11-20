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


type DbRow = Record<string, any>;
type QueryResult = { data: any; error: null | { code?: string; message: string } };

class StatefulQuery {
  private operation: "select" | "insert" | "update" = "select";
  private values: DbRow | DbRow[] | null = null;
  private filters: Array<{ key: string; op: "eq" | "lt"; value: unknown }> = [];
  private ordered: { key: string; ascending: boolean } | null = null;
  private returning = false;

  constructor(private db: StatefulDatabase, private table: string) {}
  select(_columns?: string) { this.returning = true; return this; }
  insert(values: DbRow | DbRow[]) { this.operation = "insert"; this.values = values; return this; }
  update(values: DbRow) { this.operation = "update"; this.values = values; return this; }
  eq(key: string, value: unknown) { this.filters.push({ key, op: "eq", value }); return this; }
  lt(key: string, value: unknown) { this.filters.push({ key, op: "lt", value }); return this; }
  order(key: string, options?: { ascending?: boolean }) {
    this.ordered = { key, ascending: options?.ascending !== false }; return this;
  }
  async maybeSingle(): Promise<QueryResult> {
    const result = await this.execute();
    const rows = Array.isArray(result.data) ? result.data : result.data ? [result.data] : [];
    return { data: rows[0] ?? null, error: result.error };
  }
  private matches(row: DbRow) {
    return this.filters.every(({ key, op, value }) =>
      op === "eq" ? row[key] === value : Number(row[key]) < Number(value));
  }
  private async execute(): Promise<QueryResult> {
    const rows = this.db.tables[this.table] ?? (this.db.tables[this.table] = []);
    const failureKey = this.operation + ":" + this.table;
    const injectedFailure = this.db.failures[failureKey];
    if (injectedFailure) {
      delete this.db.failures[failureKey];
      return { data: null, error: injectedFailure };
    }
    if (this.operation === "select") {
      let selected = rows.filter(row => this.matches(row));
      if (this.ordered) {
        const { key, ascending } = this.ordered;
        selected = [...selected].sort((a, b) =>
          (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0) * (ascending ? 1 : -1));
      }
      return { data: selected, error: null };
    }
    if (this.operation === "insert") {
      const values = Array.isArray(this.values) ? this.values : [this.values as DbRow];
      const inserted = values.map(value => ({ ...value, id: value.id ?? this.db.nextId() }));
      rows.push(...inserted);
      return { data: this.returning ? inserted : null, error: null };
    }
    const updated = rows.filter(row => this.matches(row));
    for (const row of updated) Object.assign(row, this.values);
    return { data: this.returning ? updated : null, error: null };
  }
  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

class StatefulDatabase {
  tables: Record<string, DbRow[]>;
  failures: Record<string, { code?: string; message: string }> = {};
  private sequence = 0;
  completionCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  claimedRun: DbRow;
  constructor() {
    this.claimedRun = {
      id: "run-1", workflow_id: "workflow-1", owner_id: "owner-1",
      input: { seed: "start" }, attempt: 1,
    };
    this.tables = {
      workflows: [{ id: "workflow-1", owner_id: "owner-1", status: "active" }],
      workflow_steps: [
        { id: "step-1", workflow_id: "workflow-1", step_order: 1, name: "First", action_type: "transform", config: { suffix: "-one" }, retry_limit: 0, timeout_seconds: 5 },
        { id: "step-2", workflow_id: "workflow-1", step_order: 2, name: "Second", action_type: "transform", config: { suffix: "-two" }, retry_limit: 0, timeout_seconds: 5 },
      ],
      workflow_step_runs: [],
      workflow_runs: [{ id: "run-1", owner_id: "owner-1", status: "running", attempt: 1 }],
      workflow_logs: [],
    };
  }
  nextId() { this.sequence++; return "generated-" + this.sequence; }
  client(key: string) {
    return {
      auth: {
        getUser: async (_token: string) => ({
          data: { user: key === "publishable" ? { id: "owner-1" } : null },
          error: key === "publishable" ? null : new Error("wrong key"),
        }),
      },
      rpc: async (name: string, args: Record<string, unknown> = {}) => {
        if (name === "simula_verify_worker_secret") return { data: true, error: null };
        if (name === "simula_claim_workflow_runs" || name === "simula_claim_workflow_runs_internal") {
          return { data: [this.claimedRun], error: null };
        }
        if (name === "simula_complete_step_with_outbox") {
          this.completionCalls.push({ name, args });
          const injected = this.failures["rpc:" + name];
          if (injected) { delete this.failures["rpc:" + name]; return { data: null, error: injected }; }
          const row = this.tables.workflow_step_runs.find(step => step.run_id === args.p_run_id &&
            step.step_id === args.p_step_id && step.owner_id === args.p_owner_id &&
            step.attempt === args.p_attempt && step.status === "running");
          const run = this.tables.workflow_runs.find(item => item.id === args.p_run_id &&
            item.owner_id === args.p_owner_id && item.attempt === args.p_attempt && item.status === "running");
          if (!row || !run || !args.p_output || typeof args.p_output !== "object") {
            return { data: null, error: { code: "40001", message: "workflow_step_generation_superseded" } };
          }
          row.status = "succeeded"; row.output = args.p_output; row.error_message = null;
          row.finished_at = "2026-01-02T03:04:05.000Z";
          return { data: [{ step_run_id: row.id, outbox_id: null, replayed: false }], error: null };
        }
        return { data: null, error: { message: "unexpected rpc: " + name } };
      },
      from: (table: string) => new StatefulQuery(this, table),
    };
  }
}

function statefulCreateClient(db: StatefulDatabase) {
  return ((_: string, key: string) => db.client(key === "test-publishable-key" ? "publishable" : "service")) as never;
}
const deterministicNow = () => new Date("2026-01-02T03:04:05.000Z");
const transformAction = async (actionType: string, input: unknown, config: Record<string, unknown>) => ({
  ...(input && typeof input === "object" ? input as Record<string, unknown> : { value: input }),
  [actionType]: config.suffix,
});

Deno.test("authenticated worker executes and persists a two-step workflow using stateful Supabase mock", async () => {
  const db = new StatefulDatabase();
  const handler = createAuthenticatedWorkerHandler({
    createClient: statefulCreateClient(db),
    env: configuredEnv,
    corsHeadersForRequest: cors,
    executeSafeAction: transformAction as never,
    now: deterministicNow,
  });
  const response = await handler(new Request("https://worker.test", {
    method: "POST",
    headers: { Authorization: "Bearer valid-token" },
    body: JSON.stringify({ limit: 1 }),
  }));
  const body = await response.json();
  assert(response.status === 200, "expected successful authenticated workflow response");
  assert(body.claimed === 1 && body.succeeded === 1 && body.failed === 0, "expected one successful workflow");
  assert(db.tables.workflow_step_runs.length === 2, "expected both step-run rows to persist");
  assert(db.tables.workflow_step_runs.every(row => row.status === "succeeded" && row.attempt === 1), "expected both step runs to succeed at attempt 1");
  assert(db.tables.workflow_runs[0].status === "succeeded", "expected workflow run to persist succeeded state");
  assert(db.completionCalls.length === 2, "authenticated worker must complete every step through the transactional RPC");
  assert(db.tables.workflow_runs[0].output.transform === "-two", "expected second step output to become final output");
  assert(db.tables.workflow_logs.length === 3, "expected two step logs and one workflow log");
});

Deno.test("cron worker executes the same workflow using verified privileged claim path", async () => {
  const db = new StatefulDatabase();
  const handler = createCronWorkerHandler({
    createClient: statefulCreateClient(db),
    env: configuredEnv,
    executeSafeAction: transformAction as never,
    now: deterministicNow,
  });
  const response = await handler(new Request("https://worker.test", {
    method: "POST",
    headers: { "x-simula-worker-secret": "s".repeat(40) },
    body: JSON.stringify({ limit: 1 }),
  }));
  const body = await response.json();
  assert(response.status === 200, "expected successful cron workflow response");
  assert(body.claimed === 1 && body.succeeded === 1 && body.failed === 0, "expected one successful cron workflow");
  assert(db.tables.workflow_step_runs.length === 2, "expected cron step-run rows to persist");
  assert(db.tables.workflow_runs[0].status === "succeeded", "expected cron workflow run to persist succeeded state");
  assert(db.completionCalls.length === 2, "cron worker must complete every step through the transactional RPC");
  assert(db.tables.workflow_logs.length === 3, "expected cron step and workflow logs");
});


Deno.test("authenticated worker fails closed when transactional completion RPC fails", async () => {
  const db = new StatefulDatabase();
  db.failures["rpc:simula_complete_step_with_outbox"] = { code: "XX000", message: "synthetic RPC failure" };
  const handler = createAuthenticatedWorkerHandler({ createClient: statefulCreateClient(db), env: configuredEnv,
    corsHeadersForRequest: cors, executeSafeAction: transformAction as never, now: deterministicNow });
  const response = await handler(new Request("https://worker.test", { method: "POST",
    headers: { Authorization: "Bearer valid-token" }, body: JSON.stringify({ limit: 1 }) }));
  const body = await response.json();
  assert(response.status === 200 && body.failed === 1 && body.succeeded === 0,
    "RPC failure must fail the workflow rather than report success");
  assert(db.completionCalls.length === 1, "completion RPC must be attempted exactly once before failure");
  assert(db.tables.workflow_step_runs[0].status === "running",
    "worker must not bypass failed RPC with a direct succeeded update");
  assert(db.tables.workflow_runs[0].status === "failed", "failed atomic completion must not mark the workflow succeeded");
});

Deno.test("authenticated worker fences a stale claimed attempt from newer persisted step state", async () => {
  const db = new StatefulDatabase();
  db.tables.workflow_step_runs.push({
    id: "newer-step-run", run_id: "run-1", step_id: "step-1",
    owner_id: "owner-1", status: "succeeded", attempt: 2,
  });
  let actions = 0;
  const handler = createAuthenticatedWorkerHandler({
    createClient: statefulCreateClient(db),
    env: configuredEnv,
    corsHeadersForRequest: cors,
    executeSafeAction: (async () => { actions++; return { unexpected: true }; }) as never,
    now: deterministicNow,
  });
  const response = await handler(new Request("https://worker.test", {
    method: "POST", headers: { Authorization: "Bearer valid-token" }, body: "{}",
  }));
  const body = await response.json();
  assert(response.status === 200, "stale claim is reported in the batch summary");
  assert(body.superseded === 1 && body.succeeded === 0, "expected stale attempt to be superseded");
  assert(actions === 0, "stale attempt must not execute workflow actions");
  assert(db.tables.workflow_step_runs[0].attempt === 2, "newer persisted step generation must remain unchanged");
});

Deno.test("cron worker persists action failure without falsely succeeding the workflow", async () => {
  const db = new StatefulDatabase();
  const handler = createCronWorkerHandler({
    createClient: statefulCreateClient(db),
    env: configuredEnv,
    executeSafeAction: (async () => { throw new Error("synthetic action failure"); }) as never,
    now: deterministicNow,
  });
  const response = await handler(new Request("https://worker.test", {
    method: "POST", headers: { "x-simula-worker-secret": "s".repeat(40) }, body: "{}",
  }));
  const body = await response.json();
  assert(response.status === 200, "worker returns a batch summary for per-run failure");
  assert(body.failed === 1 && body.succeeded === 0, "expected one failed workflow");
  assert(db.tables.workflow_step_runs[0].status === "failed", "failed action must persist failed step state");
  assert(db.tables.workflow_runs[0].status === "failed", "failed action must persist failed workflow state");
  assert(db.tables.workflow_runs[0].status !== "succeeded", "failed action must never report success");
});


Deno.test("authenticated worker retries only an allowlisted transient action failure", async () => {
  const db = new StatefulDatabase();
  db.tables.workflow_steps[0].retry_limit = 1;
  let firstStepAttempts = 0;
  const handler = createAuthenticatedWorkerHandler({
    createClient: statefulCreateClient(db),
    env: configuredEnv,
    corsHeadersForRequest: cors,
    executeSafeAction: (async (actionType: string, input: unknown, config: Record<string, unknown>) => {
      if (actionType === "transform" && config.suffix === "-one") {
        firstStepAttempts++;
        if (firstStepAttempts === 1) {
          throw Object.assign(new Error("temporary upstream issue"), { code: "UPSTREAM_UNAVAILABLE" });
        }
      }
      return transformAction(actionType, input, config);
    }) as never,
    now: deterministicNow,
  });
  const response = await handler(new Request("https://worker.test", {
    method: "POST", headers: { Authorization: "Bearer valid-token" }, body: "{}",
  }));
  const body = await response.json();
  assert(response.status === 200 && body.succeeded === 1, "expected transient failure to recover");
  assert(firstStepAttempts === 2, "expected exactly one retry for the allowlisted transient code");
  assert(db.tables.workflow_runs[0].status === "succeeded", "retried workflow must persist success");
});

Deno.test("cron worker fails closed when a step-run database insert fails", async () => {
  const db = new StatefulDatabase();
  db.failures["insert:workflow_step_runs"] = { code: "XX000", message: "synthetic database failure" };
  const handler = createCronWorkerHandler({
    createClient: statefulCreateClient(db),
    env: configuredEnv,
    executeSafeAction: transformAction as never,
    now: deterministicNow,
  });
  const response = await handler(new Request("https://worker.test", {
    method: "POST", headers: { "x-simula-worker-secret": "s".repeat(40) }, body: "{}",
  }));
  const body = await response.json();
  assert(response.status === 200 && body.failed === 1, "expected isolated run failure in batch summary");
  assert(db.tables.workflow_step_runs.length === 0, "failed insert must not create a step-run row");
  assert(db.tables.workflow_runs[0].status === "failed", "database write failure must not falsely succeed workflow");
});

Deno.test("authenticated worker rejects a claimed run owned by another user without executing actions", async () => {
  const db = new StatefulDatabase();
  db.claimedRun.owner_id = "different-owner";
  let actions = 0;
  const handler = createAuthenticatedWorkerHandler({
    createClient: statefulCreateClient(db),
    env: configuredEnv,
    corsHeadersForRequest: cors,
    executeSafeAction: (async () => { actions++; return { unexpected: true }; }) as never,
    now: deterministicNow,
  });
  const response = await handler(new Request("https://worker.test", {
    method: "POST", headers: { Authorization: "Bearer valid-token" }, body: "{}",
  }));
  const body = await response.json();
  assert(response.status === 200 && body.failed === 1, "owner mismatch must be rejected in batch summary");
  assert(actions === 0, "owner mismatch must never execute workflow actions");
  assert(db.tables.workflow_step_runs.length === 0, "owner mismatch must not persist step execution");
});


Deno.test("authenticated worker cannot commit a step after a newer generation takes over mid-execution", async () => {
  const db = new StatefulDatabase();
  let actionCalls = 0;
  const handler = createAuthenticatedWorkerHandler({
    createClient: statefulCreateClient(db),
    env: configuredEnv,
    corsHeadersForRequest: cors,
    executeSafeAction: (async (actionType: string, input: unknown, config: Record<string, unknown>) => {
      actionCalls++;
      // Simulate lease expiry/reclaim while the old action is still in flight.
      db.tables.workflow_runs[0].attempt = 2;
      db.tables.workflow_runs[0].status = "running";
      db.tables.workflow_step_runs[0].attempt = 2;
      db.tables.workflow_step_runs[0].status = "running";
      return transformAction(actionType, input, config);
    }) as never,
    now: deterministicNow,
  });
  const response = await handler(new Request("https://worker.test", {
    method: "POST", headers: { Authorization: "Bearer valid-token" }, body: "{}",
  }));
  const body = await response.json();
  assert(response.status === 200, "mid-flight supersession is a safe batch outcome");
  assert(body.superseded === 1 && body.succeeded === 0, "old generation must be marked superseded");
  assert(actionCalls === 1, "old generation must stop before executing later steps");
  assert(db.tables.workflow_runs[0].attempt === 2 && db.tables.workflow_runs[0].status === "running",
    "newer run generation must remain authoritative");
  assert(db.tables.workflow_step_runs[0].attempt === 2 && db.tables.workflow_step_runs[0].status === "running",
    "newer step generation must not be overwritten by stale completion");
  assert(db.tables.workflow_logs.length === 0, "stale generation must not write success logs");
});

Deno.test("cron worker cannot commit a step after a newer generation takes over mid-execution", async () => {
  const db = new StatefulDatabase();
  let actionCalls = 0;
  const handler = createCronWorkerHandler({
    createClient: statefulCreateClient(db),
    env: configuredEnv,
    executeSafeAction: (async (actionType: string, input: unknown, config: Record<string, unknown>) => {
      actionCalls++;
      db.tables.workflow_runs[0].attempt = 2;
      db.tables.workflow_runs[0].status = "running";
      db.tables.workflow_step_runs[0].attempt = 2;
      db.tables.workflow_step_runs[0].status = "running";
      return transformAction(actionType, input, config);
    }) as never,
    now: deterministicNow,
  });
  const response = await handler(new Request("https://worker.test", {
    method: "POST", headers: { "x-simula-worker-secret": "s".repeat(40) }, body: "{}",
  }));
  const body = await response.json();
  assert(response.status === 200, "mid-flight supersession is a safe batch outcome");
  assert(body.superseded === 1 && body.succeeded === 0, "old cron generation must be marked superseded");
  assert(actionCalls === 1, "old cron generation must stop before executing later steps");
  assert(db.tables.workflow_runs[0].attempt === 2 && db.tables.workflow_runs[0].status === "running",
    "newer cron run generation must remain authoritative");
  assert(db.tables.workflow_step_runs[0].attempt === 2 && db.tables.workflow_step_runs[0].status === "running",
    "newer cron step generation must not be overwritten by stale completion");
  assert(db.tables.workflow_logs.length === 0, "stale cron generation must not write success logs");
});


Deno.test("cron worker fails closed when transactional completion RPC fails", async () => {
  const db = new StatefulDatabase();
  db.failures["rpc:simula_complete_step_with_outbox"] = {
    code: "XX000",
    message: "synthetic RPC failure",
  };
  const handler = createCronWorkerHandler({
    createClient: statefulCreateClient(db),
    env: configuredEnv,
    executeSafeAction: transformAction as never,
    now: deterministicNow,
  });
  const response = await handler(new Request("https://worker.test", {
    method: "POST",
    headers: { "x-simula-worker-secret": "s".repeat(40) },
    body: JSON.stringify({ limit: 1 }),
  }));
  const body = await response.json();

  assert(response.status === 200, "cron reports per-run failure in its batch summary");
  assert(body.claimed === 1 && body.failed === 1 && body.succeeded === 0,
    "cron RPC failure must never be counted as workflow success");
  assert(db.completionCalls.length === 1,
    "cron must attempt transactional completion exactly once");
  assert(db.tables.workflow_step_runs.length === 1,
    "the first step-run record must remain available for failure-state inspection");
  assert(db.tables.workflow_step_runs[0].status === "running",
    "failed completion RPC must not be bypassed with a direct succeeded update");
  assert(db.tables.workflow_runs[0].status === "failed",
    "cron must fail the workflow rather than mark it succeeded");
});
