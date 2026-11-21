import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { authenticateCronRequest } from "../_shared/worker-auth-boundary.mjs";
import { createOutboxDryRunDispatcherHandler } from "../_shared/workflow-outbox-dispatcher.ts";

const handler = createOutboxDryRunDispatcherHandler({
  authenticate: async (request) => {
    const result = await authenticateCronRequest({
      request,
      env: { get: (key: string) => Deno.env.get(key) },
      createClient,
    });
    if (!result.ok) {
      return { ok: false, status: result.status ?? 401, error: result.error ?? "unauthorized" };
    }
    return {
      ok: true,
      admin: {
        rpc: (name, args) => result.admin.rpc(name, args as never),
      },
    };
  },
});

Deno.serve(handler);
