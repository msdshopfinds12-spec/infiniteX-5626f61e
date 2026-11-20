import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { executeSafeAction } from "../_shared/workflow-actions.mjs";
import { authenticateCronRequest } from "../_shared/worker-auth-boundary.mjs";
import {
  clampBatchLimit,
  executeWithinStepBudget,
  executeWithRetry,
  isClaimedRunValid,
  isWorkflowOwnedBy,
  isAttemptGenerationNewer,
  readJsonBodyLimited,
  validateStepTimeoutSeconds,
  validateRetryLimit,
} from "../_shared/worker-security.mjs";

type JsonRecord = Record<string, unknown>;
type Step = {
  id: string; step_order: number; name: string; action_type: string;
  config: JsonRecord; retry_limit: number; timeout_seconds: number;
};
type ClaimedRun = {
  id: string; workflow_id: string; owner_id: string; input: unknown; attempt: number;
};

const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
function reply(status: number, body: JsonRecord) {
  return new Response(JSON.stringify(body), { status, headers });
}
function record(value: unknown): JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as JsonRecord) } : { value };
}
async function logEvent(
  admin: SupabaseClient<any, "public", any, any, any>, ownerId: string, workflowId: string, runId: string,
  level: "info" | "warning" | "error", event: string, details: JsonRecord = {},
) {
  const { error } = await admin.from("workflow_logs").insert({
    owner_id: ownerId, workflow_id: workflowId, run_id: runId, level, event, details,
  });
  if (error) console.error("workflow_log_insert_failed", error.message);
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return reply(405, { ok: false, error: "method_not_allowed" });

  const authentication = await authenticateCronRequest({
    request: req,
    env: { get: (key: string) => Deno.env.get(key) },
    createClient,
  });
  if (!authentication.ok) {
    if (authentication.status === 500) console.error("worker_environment_incomplete");
    return reply(authentication.status, { ok: false, error: authentication.error });
  }
  const { admin } = authentication;

  const bodyResult = await readJsonBodyLimited(req, 2048);
  if (!bodyResult.ok) {
    const status = bodyResult.reason === "payload_too_large" ? 413 : 400;
    return reply(status, { ok: false, error: bodyResult.reason });
  }
  const body = bodyResult.value;
  const limit = clampBatchLimit(body && typeof body === "object" ? body.limit : undefined);

  const { data: claimedRuns, error: claimError } = await admin.rpc(
    "simula_claim_workflow_runs_internal", { p_limit: limit },
  );
  if (claimError) {
    console.error("queue_claim_failed", claimError.message);
    return reply(500, { ok: false, error: "queue_claim_failed" });
  }

  const summary = { ok: true, claimed: (claimedRuns ?? []).length, succeeded: 0, failed: 0, superseded: 0, runs: [] as JsonRecord[] };

  for (const run of (claimedRuns ?? []) as ClaimedRun[]) {
    if (!isClaimedRunValid(run)) {
      summary.failed++;
      summary.runs.push({ status: "rejected", error: "claimed_run_invalid" });
      continue;
    }
    const ownerId = run.owner_id;
    let payload: unknown = record(run.input);
    let failure = "";
    try {
      const { data: workflow, error: workflowError } = await admin
        .from("workflows").select("id,owner_id,status")
        .eq("id", run.workflow_id).eq("owner_id", ownerId).maybeSingle();
      if (workflowError || !workflow || !isWorkflowOwnedBy(workflow, run.workflow_id, ownerId)) throw new Error("workflow_owner_validation_failed");
      if (workflow.status === "archived") throw new Error("workflow_archived");

      const { data: steps, error: stepsError } = await admin
        .from("workflow_steps")
        .select("id,step_order,name,action_type,config,retry_limit,timeout_seconds")
        .eq("workflow_id", run.workflow_id)
        .order("step_order", { ascending: true });
      if (stepsError) throw new Error("workflow_steps_read_failed");
      if (!steps || steps.length === 0) throw new Error("workflow_has_no_steps");

      for (const step of steps as Step[]) {
        const config = record(step.config);
        const { data: previous, error: previousError } = await admin
          .from("workflow_step_runs").select("id,attempt")
          .eq("run_id", run.id).eq("step_id", step.id).eq("owner_id", ownerId).maybeSingle();
        if (previousError) throw new Error("step_run_lookup_failed");

        // Step attempts track the workflow-run generation so stale workers
        // cannot replace state written by a newer claim.
        const stepAttempt = run.attempt;
        const stepRunPayload = {
          run_id: run.id, step_id: step.id, owner_id: ownerId, status: "running",
          input: record(payload), output: null, error_message: null,
          attempt: stepAttempt, started_at: new Date().toISOString(), finished_at: null,
        };
        if (previous) {
          if (!isAttemptGenerationNewer(previous.attempt, stepAttempt)) {
            throw new Error("workflow_step_attempt_superseded");
          }
          const { data: startedStep, error: startError } = await admin
            .from("workflow_step_runs").update(stepRunPayload)
            .eq("run_id", run.id).eq("step_id", step.id).eq("owner_id", ownerId)
            .lt("attempt", stepAttempt).select("id").maybeSingle();
          if (startError) throw new Error("step_run_start_failed");
          if (!startedStep) throw new Error("workflow_step_attempt_superseded");
        } else {
          const { data: insertedStep, error: insertError } = await admin
            .from("workflow_step_runs").insert(stepRunPayload).select("id").maybeSingle();
          if (insertError?.code === "23505") {
            const { data: startedStep, error: startError } = await admin
              .from("workflow_step_runs").update(stepRunPayload)
              .eq("run_id", run.id).eq("step_id", step.id).eq("owner_id", ownerId)
              .lt("attempt", stepAttempt).select("id").maybeSingle();
            if (startError) throw new Error("step_run_start_failed");
            if (!startedStep) throw new Error("workflow_step_attempt_superseded");
          } else {
            if (insertError || !insertedStep) throw new Error("step_run_start_failed");
          }
        }

        let output: JsonRecord | null = null;
        let actionError = "";
        try {
          const timeoutSeconds = validateStepTimeoutSeconds(step.timeout_seconds);
          const retryLimit = validateRetryLimit(step.retry_limit);
          output = await executeWithRetry(
            () => executeWithinStepBudget(
              () => executeSafeAction(step.action_type, payload, config),
              { input: payload, config },
              timeoutSeconds,
              64 * 1024,
            ),
            retryLimit,
            { maxElapsedMs: timeoutSeconds * 1000 },
          );
        } catch (error) {
          actionError = error instanceof Error ? error.message : "action_failed";
        }
        if (actionError || !output) {
          const { data: failedStep, error: stepFailureError } = await admin.from("workflow_step_runs").update({
            status: "failed", error_message: (actionError || "action_failed").slice(0, 500),
            finished_at: new Date().toISOString(),
          }).eq("run_id", run.id).eq("step_id", step.id).eq("owner_id", ownerId)
            .eq("attempt", stepAttempt).select("id").maybeSingle();
          if (stepFailureError) throw new Error("step_run_failure_update_failed");
          if (!failedStep) throw new Error("workflow_step_attempt_superseded");
          throw new Error("step_failed:" + step.name + ":" + (actionError || "action_failed"));
        }

        payload = output;
        const { data: finishedStep, error: finishStepError } = await admin.from("workflow_step_runs").update({
          status: "succeeded", output, error_message: null, finished_at: new Date().toISOString(),
        }).eq("run_id", run.id).eq("step_id", step.id).eq("owner_id", ownerId)
          .eq("attempt", stepAttempt).select("id").maybeSingle();
        if (finishStepError) throw new Error("step_run_finish_failed");
        if (!finishedStep) throw new Error("workflow_step_attempt_superseded");
        await logEvent(admin, ownerId, run.workflow_id, run.id, "info", "workflow_step_succeeded", {
          step_id: step.id, step_order: step.step_order, action_type: step.action_type,
        });
      }

      const { data: finishedRun, error: finishRunError } = await admin.from("workflow_runs").update({
        status: "succeeded", output: record(payload), error_message: null, finished_at: new Date().toISOString(),
      }).eq("id", run.id).eq("owner_id", ownerId).eq("status", "running")
        .eq("attempt", run.attempt).select("id").maybeSingle();
      if (finishRunError) throw new Error("workflow_run_finish_failed");
      if (!finishedRun) throw new Error("workflow_run_attempt_superseded");
      await logEvent(admin, ownerId, run.workflow_id, run.id, "info", "workflow_run_succeeded", {
        attempt: run.attempt, step_count: steps.length,
      });
      summary.succeeded++;
      summary.runs.push({ id: run.id, status: "succeeded" });
    } catch (error) {
      failure = (error instanceof Error ? error.message : "workflow_run_failed").slice(0, 500);
    }

    if (failure) {
      if (failure.includes("attempt_superseded")) {
        summary.superseded++;
        summary.runs.push({ id: run.id, status: "superseded", reason: "attempt_generation_changed" });
        continue;
      }
      const { data: failedRun, error: updateError } = await admin.from("workflow_runs").update({
        status: "failed", error_message: failure, finished_at: new Date().toISOString(),
      }).eq("id", run.id).eq("owner_id", ownerId).eq("status", "running")
        .eq("attempt", run.attempt).select("id").maybeSingle();
      if (updateError) console.error("workflow_run_failure_update_failed", updateError.message);
      if (!failedRun) {
        summary.superseded++;
        summary.runs.push({ id: run.id, status: "superseded", reason: "attempt_generation_changed" });
        continue;
      }
      await logEvent(admin, ownerId, run.workflow_id, run.id, "error", "workflow_run_failed", {
        attempt: run.attempt, error: failure,
      });
      summary.failed++;
      summary.runs.push({ id: run.id, status: "failed", error: failure });
    }
  }

  return reply(200, summary);
});