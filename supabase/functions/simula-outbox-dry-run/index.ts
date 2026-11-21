import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { authenticateCronRequest } from "../_shared/worker-auth-boundary.mjs";
import { readJsonBodyLimited } from "../_shared/worker-security.mjs";
import { planOutboxDryRunBatch } from "../_shared/outbox-dry-run.ts";

const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };

export function createOutboxDryRunHandler(deps: {
  createClient: typeof createClient;
  env: { get(name: string): string | undefined };
  authenticate?: typeof authenticateCronRequest;
}) {
  const authenticate = deps.authenticate ?? authenticateCronRequest;
  return async (request: Request) => {
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ ok: false, error: "method_not_allowed" }), { status: 405, headers });
    }
    const auth = await authenticate({ request, env: deps.env, createClient: deps.createClient });
    if (!auth.ok) {
      return new Response(JSON.stringify({ ok: false, error: auth.error }), { status: auth.status, headers });
    }
    const body = await readJsonBodyLimited(request, 32 * 1024);
    if (!body.ok) {
      const status = body.reason === "payload_too_large" ? 413 : 400;
      return new Response(JSON.stringify({ ok: false, error: body.reason }), { status, headers });
    }
    try {
      const events = body.value && typeof body.value === "object" && !Array.isArray(body.value)
        ? (body.value as Record<string, unknown>).events : undefined;
      const plans = planOutboxDryRunBatch(events);
      return new Response(JSON.stringify({
        ok: true,
        mode: "dry_run",
        claimedFromDatabase: false,
        deliveryPerformed: false,
        plans,
      }), { status: 200, headers });
    } catch {
      return new Response(JSON.stringify({ ok: false, error: "outbox_dry_run_input_invalid" }), { status: 400, headers });
    }
  };
}

if (import.meta.main) {
  Deno.serve(createOutboxDryRunHandler({
    createClient,
    env: { get: (key: string) => Deno.env.get(key) },
  }));
}
