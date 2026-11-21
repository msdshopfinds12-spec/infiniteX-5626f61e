import {
  createOutboxDryRunDispatcherHandler,
  type ClaimedWorkflowOutboxEvent,
} from "./workflow-outbox-dispatcher.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const nowMs = Date.parse("2026-11-21T08:00:00.000Z");
const event: ClaimedWorkflowOutboxEvent = {
  id: "81000000-4000-4000-8000-000000000010",
  owner_id: "81000000-1000-4000-8000-000000000001",
  event_type: "notification.requested",
  idempotency_key: "phase91:owner:run:step:1:notification.requested",
  payload: {
    recipient_ref: "81000000-1000-4000-8000-000000000001",
    template_key: "welcome-v1",
  },
  attempts: 1,
  lock_token: "81000000-4000-4000-8000-000000000011",
  lease_until: "2026-11-21T08:01:00.000Z",
};

Deno.test("dispatcher authenticates before claiming and records simulation without delivery", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  let authenticated = false;
  const handler = createOutboxDryRunDispatcherHandler({
    authenticate: async () => {
      authenticated = true;
      return {
        ok: true,
        admin: {
          rpc: async (name, args) => {
            calls.push({ name, args });
            if (name === "simula_claim_workflow_outbox") return { data: [event], error: null };
            if (name === "simula_record_workflow_outbox_simulation") {
              return { data: [{ status: "simulated", replayed: false }], error: null };
            }
            throw new Error("unexpected_rpc");
          },
        },
      };
    },
    now: () => new Date(nowMs),
  });
  const response = await handler(new Request("https://worker.test", {
    method: "POST",
    body: JSON.stringify({ limit: 1 }),
  }));
  const body = await response.json();
  assert(authenticated, "cron authentication must be required");
  assert(response.status === 200 && body.simulated === 1, "valid event must be simulated");
  assert(body.deliveryAttempted === false, "dry-run must explicitly report no delivery");
  assert(calls.length === 2, "only claim and simulation RPCs may be called");
  assert(calls[0].name === "simula_claim_workflow_outbox", "claim RPC must run first");
  assert(calls[1].name === "simula_record_workflow_outbox_simulation", "simulation RPC must record distinct state");
  assert(calls[1].args.p_id === event.id, "simulation must be fenced to the claimed event");
  assert(calls[1].args.p_lock_token === event.lock_token, "simulation must use the lease token");
});

Deno.test("dispatcher rejects unauthorized requests without touching outbox RPCs", async () => {
  let rpcCalled = false;
  const handler = createOutboxDryRunDispatcherHandler({
    authenticate: async () => ({ ok: false, status: 401, error: "unauthorized" }),
  });
  const response = await handler(new Request("https://worker.test", { method: "POST" }));
  assert(response.status === 401, "unauthorized request must be rejected");
  assert(!rpcCalled, "no RPC may execute before authentication");
});

Deno.test("dispatcher sends malformed payloads to bounded retry without simulation", async () => {
  const calls: string[] = [];
  const malformed = {
    ...event,
    payload: { callback_url: "https://attacker.example" },
  };
  const handler = createOutboxDryRunDispatcherHandler({
    authenticate: async () => ({
      ok: true,
      admin: {
        rpc: async (name) => {
          calls.push(name);
          if (name === "simula_claim_workflow_outbox") return { data: [malformed], error: null };
          if (name === "simula_finish_workflow_outbox") return { data: [{ status: "pending" }], error: null };
          throw new Error("unexpected_rpc");
        },
      },
    }),
    now: () => new Date(nowMs),
  });
  const response = await handler(new Request("https://worker.test", { method: "POST" }));
  const body = await response.json();
  assert(response.status === 200 && body.rejected === 1, "invalid payload must be rejected");
  assert(calls.includes("simula_finish_workflow_outbox"), "invalid event must enter bounded retry path");
  assert(!calls.includes("simula_record_workflow_outbox_simulation"), "invalid payload must never be simulated");
});

Deno.test("dispatcher defers transient simulation RPC errors without false rejection", async () => {
  const handler = createOutboxDryRunDispatcherHandler({
    authenticate: async () => ({
      ok: true,
      admin: {
        rpc: async (name) => name === "simula_claim_workflow_outbox"
          ? { data: [event], error: null }
          : { data: null, error: new Error("temporary database failure") },
      },
    }),
    now: () => new Date(nowMs),
  });
  const response = await handler(new Request("https://worker.test", { method: "POST" }));
  const body = await response.json();
  assert(response.status === 200 && body.deferred === 1, "transient RPC error must be deferred");
  assert(body.rejected === 0, "infrastructure error must not be mislabeled invalid data");
});

Deno.test("dispatcher enforces method and bounded request body", async () => {
  const handler = createOutboxDryRunDispatcherHandler({
    authenticate: async () => ({ ok: false, error: "not_reached" }),
  });
  const methodResponse = await handler(new Request("https://worker.test", { method: "GET" }));
  assert(methodResponse.status === 405, "non-POST methods must be rejected");
  const authHandler = createOutboxDryRunDispatcherHandler({
    authenticate: async () => ({ ok: true, admin: { rpc: async () => ({ data: [], error: null }) } }),
  });
  const bodyResponse = await authHandler(new Request("https://worker.test", {
    method: "POST",
    body: "x".repeat(2049),
  }));
  assert(bodyResponse.status === 413, "oversized request bodies must be rejected");
});
