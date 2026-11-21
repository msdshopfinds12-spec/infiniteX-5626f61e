import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { executeSafeAction } from "../_shared/workflow-actions.mjs";
import { authenticateBearerRequest } from "../_shared/worker-auth-boundary.mjs";
import { corsHeadersForRequest } from "../_shared/cors.ts";
import {
  clampBatchLimit,
  executeWithinStepBudget,
  executeWithRetry,
  isWorkflowOwnedBy,
  readJsonBodyLimited,
  validateStepTimeoutSeconds,
  validateRetryLimit,
} from "../_shared/worker-security.mjs";
import {
  claimWorkflowLeases,
  heartbeatWorkflowLease,
  startWorkflowStepWithLease,
  failWorkflowStepWithLease,
  completeWorkflowStepWithLease,
  finishWorkflowRunWithLease,
  type LeaseRpc,
} from "../_shared/workflow-lease-rpc.ts";
import { WorkflowLeaseError } from "../_shared/workflow-lease-contract.ts";
import { WorkflowLeaseSupervisor } from "../_shared/workflow-lease-supervisor.ts";
import { createWorkflowStepCompletedEvent } from "../_shared/workflow-outbox-contract.ts";

type JsonRecord = Record<string, unknown>;
type Step = {
  id: string;
  step_order: number;
  name: string;
  action_type: string;
  config: JsonRecord;
  retry_limit: number;
  timeout_seconds: number;
};

function record(value: unknown): JsonRecord {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return { ...(value as JsonRecord) };
  }
  return { value };
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "workflow_run_failed";
  return message.slice(0, 500);
}

function assertLeaseActive(supervisor: WorkflowLeaseSupervisor): void {
  if (supervisor.signal.aborted || supervisor.isTerminal) {
    const reason = supervisor.signal.reason;
    if (reason instanceof WorkflowLeaseError) throw reason;
    throw new WorkflowLeaseError("LEASE_LOST", reason);
  }
}

function abortableSleep(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new WorkflowLeaseError("LEASE_LOST", signal.reason));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      reject(new WorkflowLeaseError("LEASE_LOST", signal.reason));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function logEvent(
  admin: SupabaseClient<any, "public", any, any, any>,
  ownerId: string,
  workflowId: string,
  runId: string,
  level: "info" | "warning" | "error",
  event: string,
  details: JsonRecord = {},
): Promise<void> {
  try {
    const { error } = await admin.from("workflow_logs").insert({
      owner_id: ownerId, workflow_id: workflowId, run_id: runId, level, event, details,
    });
    if (error) console.error("workflow_log_insert_failed", error.message);
  } catch (error) {
    // Observability is deliberately non-authoritative; it cannot trigger a
    // second workflow transition after a successful fenced completion.
    console.error("workflow_log_insert_failed", safeError(error));
  }
}

export type AuthenticatedWorkerDependencies = {
  createClient: typeof createClient;
  env: { get(name: string): string | undefined };
  corsHeadersForRequest: typeof corsHeadersForRequest;
  executeSafeAction: typeof executeSafeAction;
  authenticateBearerRequest?: typeof authenticateBearerRequest;
  now?: () => Date;
};

export function createAuthenticatedWorkerHandler(deps: AuthenticatedWorkerDependencies) {
  const { createClient, env, corsHeadersForRequest, executeSafeAction } = deps;
  const now = deps.now ?? (() => new Date());
  const authenticate = deps.authenticateBearerRequest ?? authenticateBearerRequest;
  const respond = (req: Request, status: number, body: JsonRecord) =>
    new Response(JSON.stringify(body), { status, headers: corsHeadersForRequest(req).headers });

  return async (req: Request) => {
    const cors = corsHeadersForRequest(req);
    if (!cors.allowed) return new Response("origin_not_allowed", { status: 403, headers: cors.headers });
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors.headers });
    if (req.method !== "POST") return respond(req, 405, { ok: false, error: "method_not_allowed" });

    // Authentication is completed before constructing the service-role client.
    const authentication = await authenticate({ request: req, env, createClient });
    if (!authentication.ok) {
      if (authentication.status === 500) console.error("worker_environment_incomplete");
      return respond(req, authentication.status ?? 401, { ok: false, error: authentication.error });
    }
    const { ownerId, supabaseUrl, serviceRoleKey } = authentication;

    const bodyResult = await readJsonBodyLimited(req, 2048);
    if (!bodyResult.ok) {
      const status = bodyResult.reason === "payload_too_large" ? 413 : 400;
      return respond(req, status, { ok: false, error: bodyResult.reason });
    }
    const body = bodyResult.value;
    const limit = clampBatchLimit(body && typeof body === "object" ? body.limit : undefined);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const rpc: LeaseRpc = async (name, args) => {
      const result = await admin.rpc(name, args as never);
      return { data: result.data, error: result.error };
    };

    let leases;
    try {
      leases = await claimWorkflowLeases(rpc, { ownerId, limit, leaseSeconds: 90 });
    } catch (error) {
      console.error("queue_lease_claim_failed", safeError(error));
      return respond(req, 500, { ok: false, error: "queue_claim_failed" });
    }

    const summary = {
      ok: true, claimed: leases.length, succeeded: 0, failed: 0,
      superseded: 0, lease_lost: 0, runs: [] as JsonRecord[],
    };

    for (const lease of leases) {
      // Defense in depth: never process a row outside the verified bearer owner.
      if (lease.ownerId !== ownerId) {
        summary.failed++;
        summary.runs.push({ id: lease.runId, status: "rejected", error: "claimed_run_owner_mismatch" });
        continue;
      }

      const supervisor = new WorkflowLeaseSupervisor({
        lease,
        leaseDurationSeconds: 90,
        heartbeatIntervalMs: 30_000,
        heartbeatTimeoutMs: 10_000,
        heartbeat: (identity) => heartbeatWorkflowLease(rpc, identity, 90),
      });
      supervisor.start();

      let payload: unknown = record(lease.input);
      let workflowId = lease.workflowId;
      let stepCount = 0;
      try {
        assertLeaseActive(supervisor);
        const { data: workflow, error: workflowError } = await admin
          .from("workflows").select("id,owner_id,status")
          .eq("id", workflowId).eq("owner_id", ownerId).maybeSingle();
        assertLeaseActive(supervisor);
        if (workflowError || !workflow || !isWorkflowOwnedBy(workflow, workflowId, ownerId)) {
          throw new Error("workflow_owner_validation_failed");
        }
        if (workflow.status === "archived") throw new Error("workflow_archived");

        const { data: steps, error: stepsError } = await admin
          .from("workflow_steps")
          .select("id,step_order,name,action_type,config,retry_limit,timeout_seconds")
          .eq("workflow_id", workflowId)
          .order("step_order", { ascending: true });
        assertLeaseActive(supervisor);
        if (stepsError) throw new Error("workflow_steps_read_failed");
        if (!steps || steps.length === 0) throw new Error("workflow_has_no_steps");

        for (const step of steps as Step[]) {
          assertLeaseActive(supervisor);
          const config = record(step.config);
          await startWorkflowStepWithLease(rpc, supervisor.lease, step.id, record(payload));
          assertLeaseActive(supervisor);

          let actionOutput: JsonRecord;
          try {
            const timeoutSeconds = validateStepTimeoutSeconds(step.timeout_seconds);
            const retryLimit = validateRetryLimit(step.retry_limit);
            actionOutput = await executeWithRetry(
              () => {
                assertLeaseActive(supervisor);
                const output = executeWithinStepBudget(
                  () => executeSafeAction(step.action_type, payload, config),
                  { input: payload, config },
                  timeoutSeconds,
                  64 * 1024,
                );
                assertLeaseActive(supervisor);
                return output;
              },
              retryLimit,
              {
                maxElapsedMs: timeoutSeconds * 1000,
                sleep: (ms: number) => abortableSleep(ms, supervisor.signal),
              },
            );
          } catch (actionError) {
            assertLeaseActive(supervisor);
            const message = safeError(actionError);
            await failWorkflowStepWithLease(rpc, supervisor.lease, step.id, message);
            throw new Error("step_failed:" + step.name + ":" + message);
          }

          assertLeaseActive(supervisor);
          const event = createWorkflowStepCompletedEvent({
            runId: lease.runId, stepId: step.id, attempt: lease.attempt,
          });
          await completeWorkflowStepWithLease(rpc, supervisor.lease, step.id, actionOutput, event);
          assertLeaseActive(supervisor);
          payload = actionOutput;
          stepCount++;
          await logEvent(admin, ownerId, workflowId, lease.runId, "info", "workflow_step_succeeded", {
            step_id: step.id, step_order: step.step_order, action_type: step.action_type,
          });
        }

        assertLeaseActive(supervisor);
        await finishWorkflowRunWithLease(rpc, supervisor.lease, "succeeded", record(payload));
        await logEvent(admin, ownerId, workflowId, lease.runId, "info", "workflow_run_succeeded", {
          attempt: lease.attempt, step_count: stepCount,
        });
        summary.succeeded++;
        summary.runs.push({ id: lease.runId, status: "succeeded" });
      } catch (error) {
        const leaseFailure = error instanceof WorkflowLeaseError || supervisor.isTerminal;
        if (leaseFailure) {
          summary.lease_lost++;
          summary.runs.push({
            id: lease.runId, status: "lease_lost",
            reason: error instanceof WorkflowLeaseError ? error.code : "LEASE_LOST",
          });
        } else {
          const message = safeError(error);
          try {
            await finishWorkflowRunWithLease(rpc, supervisor.lease, "failed", undefined, message);
            await logEvent(admin, ownerId, workflowId, lease.runId, "error", "workflow_run_failed", {
              attempt: lease.attempt, error: message,
            });
            summary.failed++;
            summary.runs.push({ id: lease.runId, status: "failed", error: message });
          } catch (finishError) {
            summary.superseded++;
            summary.runs.push({
              id: lease.runId, status: "superseded",
              reason: finishError instanceof WorkflowLeaseError ? finishError.code : "terminal_transition_unconfirmed",
            });
          }
        }
      } finally {
        // Local shutdown only. The database lease is terminalized exclusively
        // through the fenced finish RPC or expires naturally after lease loss.
        await supervisor.release();
      }
    }

    return respond(req, 200, summary);
  };
}

if (import.meta.main) {
  Deno.serve(createAuthenticatedWorkerHandler({
    createClient,
    env: { get: (key: string) => Deno.env.get(key) },
    corsHeadersForRequest,
    executeSafeAction,
  }));
}
