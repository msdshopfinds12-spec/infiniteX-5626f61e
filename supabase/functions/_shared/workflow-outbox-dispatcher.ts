export type ClaimedWorkflowOutboxEvent = {
  id: string;
  owner_id: string;
  event_type: string;
  idempotency_key: string;
  payload: Record<string, unknown>;
  attempts: number;
  lock_token: string;
  lease_until: string;
};

export type OutboxDryRunPlan = {
  mode: "dry_run";
  deliveryAttempted: false;
  eventId: string;
  eventType: "notification.requested";
  adapter: "notification-intent-preview-v1";
  idempotencyKey: string;
  payload: {
    recipient_ref: string;
    template_key: string;
  };
  outcome: "validated_not_delivered";
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TEMPLATE_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/i;

/**
 * Pure dry-run dispatcher core. It validates a claimed lease and resolves a
 * closed adapter; it has no database client, fetch/network capability, secret
 * resolver, or provider side effect. A plan is explicitly NOT delivery.
 */
export function createOutboxDryRunPlan(
  event: ClaimedWorkflowOutboxEvent,
  nowMs: number,
): OutboxDryRunPlan {
  if (
    !event ||
    !UUID_PATTERN.test(event.id) ||
    !UUID_PATTERN.test(event.owner_id) ||
    !UUID_PATTERN.test(event.lock_token) ||
    event.event_type !== "notification.requested" ||
    typeof event.idempotency_key !== "string" ||
    event.idempotency_key.length < 1 ||
    event.idempotency_key.length > 200 ||
    !Number.isSafeInteger(event.attempts) ||
    event.attempts < 1 ||
    event.attempts > 8 ||
    typeof event.lease_until !== "string" ||
    !Number.isFinite(Date.parse(event.lease_until)) ||
    Date.parse(event.lease_until) <= nowMs ||
    !event.payload ||
    typeof event.payload !== "object" ||
    Array.isArray(event.payload)
  ) {
    throw new Error("outbox_dry_run_invalid_claim");
  }

  const keys = Object.keys(event.payload).sort();
  const recipientRef = event.payload.recipient_ref;
  const templateKey = event.payload.template_key;
  if (
    keys.length !== 2 ||
    keys[0] !== "recipient_ref" ||
    keys[1] !== "template_key" ||
    recipientRef !== event.owner_id ||
    typeof recipientRef !== "string" ||
    !UUID_PATTERN.test(recipientRef) ||
    typeof templateKey !== "string" ||
    !TEMPLATE_PATTERN.test(templateKey)
  ) {
    throw new Error("outbox_dry_run_invalid_payload");
  }

  return {
    mode: "dry_run",
    deliveryAttempted: false,
    eventId: event.id,
    eventType: "notification.requested",
    adapter: "notification-intent-preview-v1",
    idempotencyKey: event.idempotency_key,
    payload: { recipient_ref: recipientRef, template_key: templateKey },
    outcome: "validated_not_delivered",
  };
}


export type OutboxDispatcherRpc = (
  functionName: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: unknown | null }>;

export type OutboxDispatcherAuthentication = {
  ok: true;
  admin: { rpc: OutboxDispatcherRpc };
} | {
  ok: false;
  status?: number;
  error: string;
};

export type OutboxDryRunDispatcherDependencies = {
  authenticate(request: Request): Promise<OutboxDispatcherAuthentication>;
  now?: () => Date;
};

function boundedLimit(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 10;
  return Math.max(1, Math.min(25, Math.floor(value)));
}

function hasRpcStatus(
  data: unknown,
  statuses: readonly string[],
): boolean {
  if (!Array.isArray(data) || data.length !== 1) return false;
  const row = data[0];
  return Boolean(
    row &&
    typeof row === "object" &&
    statuses.includes((row as { status?: unknown }).status as string) &&
    (row as { replayed?: unknown }).replayed === false ||
    row &&
    typeof row === "object" &&
    statuses.includes((row as { status?: unknown }).status as string) &&
    (row as { replayed?: unknown }).replayed === true
  );
}

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Cron-only dry-run dispatcher. It claims leases, validates fixed event
 * contracts, and records a distinct simulated state. It never calls fetch,
 * resolves provider credentials, or reports external delivery.
 */
export function createOutboxDryRunDispatcherHandler(
  deps: OutboxDryRunDispatcherDependencies,
) {
  const now = deps.now ?? (() => new Date());
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") {
      return jsonResponse(405, { ok: false, error: "method_not_allowed" });
    }

    const authentication = await deps.authenticate(request);
    if (!authentication.ok) {
      return jsonResponse(
        typeof authentication.status === "number" ? authentication.status : 401,
        { ok: false, error: authentication.error },
      );
    }

    let body: Record<string, unknown> = {};
    try {
      const raw = await request.text();
      if (raw.length > 2048) {
        return jsonResponse(413, { ok: false, error: "payload_too_large" });
      }
      if (raw.length > 0) {
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          return jsonResponse(400, { ok: false, error: "invalid_request_body" });
        }
        body = parsed as Record<string, unknown>;
      }
    } catch {
      return jsonResponse(400, { ok: false, error: "invalid_request_body" });
    }

    const limit = boundedLimit(body.limit);
    const { data, error } = await authentication.admin.rpc(
      "simula_claim_workflow_outbox",
      { p_limit: limit },
    );
    if (error || !Array.isArray(data) || data.length > limit) {
      return jsonResponse(500, { ok: false, error: "outbox_claim_failed" });
    }

    const summary = {
      ok: true,
      mode: "dry_run",
      deliveryAttempted: false,
      claimed: data.length,
      simulated: 0,
      rejected: 0,
      deferred: 0,
    };

    for (const candidate of data) {
      let plan: OutboxDryRunPlan;
      try {
        plan = createOutboxDryRunPlan(
          candidate as ClaimedWorkflowOutboxEvent,
          now().getTime(),
        );
      } catch (error) {
        const safeCode = error instanceof Error &&
          error.message === "outbox_dry_run_invalid_payload"
          ? "outbox_dry_run_invalid_payload"
          : "outbox_dry_run_invalid_claim";
        const candidateRecord = candidate as Partial<ClaimedWorkflowOutboxEvent>;
        if (typeof candidateRecord.id !== "string" ||
            typeof candidateRecord.lock_token !== "string") {
          summary.rejected++;
          continue;
        }
        try {
          const finish = await authentication.admin.rpc(
            "simula_finish_workflow_outbox",
            {
              p_id: candidateRecord.id,
              p_lock_token: candidateRecord.lock_token,
              p_succeeded: false,
              p_error: safeCode,
            },
          );
          if (finish.error || !hasRpcStatus(finish.data, ["pending", "dead"])) {
            summary.deferred++;
          } else {
            summary.rejected++;
          }
        } catch {
          summary.deferred++;
        }
        continue;
      }

      // Infrastructure/RPC errors are deferred, never reclassified as bad
      // event data. The lease will expire and can be safely reclaimed.
      try {
        const result = await authentication.admin.rpc(
          "simula_record_workflow_outbox_simulation",
          {
            p_id: plan.eventId,
            p_lock_token: (candidate as ClaimedWorkflowOutboxEvent).lock_token,
            p_result: {
              mode: plan.mode,
              delivery_attempted: false,
              event_type: plan.eventType,
              adapter: plan.adapter,
              outcome: plan.outcome,
              idempotency_key: plan.idempotencyKey,
            },
          },
        );
        if (result.error || !hasRpcStatus(result.data, ["simulated"])) {
          summary.deferred++;
        } else {
          summary.simulated++;
        }
      } catch {
        summary.deferred++;
      }
    }
    return jsonResponse(200, summary);
  };
}
