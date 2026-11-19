import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  clampBatchLimit,
  executeWithinStepBudget,
  isClaimedRunValid,
  isWorkflowOwnedBy,
  readJsonBodyLimited,
  validateStepTimeoutSeconds,
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
function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(label + "_must_be_non_empty_string");
  return value;
}
function executeSafeAction(actionType: string, input: unknown, config: JsonRecord): JsonRecord {
  const data = record(input);
  switch (actionType) {
    case "pass_through": return data;
    case "set_value": {
      const key = requiredString(config.key, "config.key");
      if (!Object.prototype.hasOwnProperty.call(config, "value")) throw new Error("config.value_required");
      return { ...data, [key]: config.value };
    }
    case "merge_json": {
      const value = config.value;
      if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("config.value_must_be_json_object");
      return { ...data, ...(value as JsonRecord) };
    }
    case "uppercase_text":
    case "lowercase_text":
    case "append_text":
    case "prepend_text": {
      const key = typeof config.key === "string" && config.key.trim() ? config.key : "text";
      const current = data[key];
      if (typeof current !== "string") throw new Error("input_text_field_required:" + key);
      let next = current;
      if (actionType === "uppercase_text") next = current.toUpperCase();
      if (actionType === "lowercase_text") next = current.toLowerCase();
      if (actionType === "append_text") next = current + requiredString(config.text, "config.text");
      if (actionType === "prepend_text") next = requiredString(config.text, "config.text") + current;
      return { ...data, [key]: next };
    }
    default: throw new Error("unsupported_action_type:" + actionType);
  }
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

async function transitionStep(
  admin: SupabaseClient<any, "public", any, any, any>,
  args: {
    p_run_id: string;
    p_step_id: string;
    p_owner_id: string;
    p_attempt: number;
    p_transition: "start" | "succeed" | "fail";
    p_input: JsonRecord | null;
    p_output: JsonRecord | null;
    p_error_message: string | null;
  },
) {
  const { data, error } = await admin.rpc("simula_transition_workflow_step", args);
  if (error) throw new Error(error.message || "workflow_step_transition_failed");
  if (typeof data !== "string" || data.length === 0) {
    throw new Error("workflow_step_transition_failed");
  }
  return data;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return reply(405, { ok: false, error: "method_not_allowed" });

  const suppliedSecret = req.headers.get("x-simula-worker-secret");
  if (!suppliedSecret || suppliedSecret.length < 32) return reply(401, { ok: false, error: "unauthorized" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("worker_environment_incomplete");
    return reply(500, { ok: false, error: "worker_environment_incomplete" });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: secretValid, error: verifyError } = await admin.rpc(
    "simula_verify_worker_secret", { p_secret: suppliedSecret },
  );
  if (verifyError || secretValid !== true) return reply(401, { ok: false, error: "unauthorized" });

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
        const stepAttempt = run.attempt;
        await transitionStep(admin, {
          p_run_id: run.id,
          p_step_id: step.id,
          p_owner_id: ownerId,
          p_attempt: stepAttempt,
          p_transition: "start",
          p_input: record(payload),
          p_output: null,
          p_error_message: null,
        });

        let output: JsonRecord | null = null;
        let actionError = "";
        try {
          const timeoutSeconds = validateStepTimeoutSeconds(step.timeout_seconds);
          output = executeWithinStepBudget(
            () => executeSafeAction(step.action_type, payload, config),
            { input: payload, config },
            timeoutSeconds,
            64 * 1024,
          );
        } catch (error) {
          actionError = error instanceof Error ? error.message : "action_failed";
        }
        if (actionError || !output) {
          await transitionStep(admin, {
            p_run_id: run.id,
            p_step_id: step.id,
            p_owner_id: ownerId,
            p_attempt: stepAttempt,
            p_transition: "fail",
            p_input: null,
            p_output: null,
            p_error_message: (actionError || "action_failed").slice(0, 500),
          });
          throw new Error("step_failed:" + step.name + ":" + (actionError || "action_failed"));
        }

        payload = output;
        await transitionStep(admin, {
          p_run_id: run.id,
          p_step_id: step.id,
          p_owner_id: ownerId,
          p_attempt: stepAttempt,
          p_transition: "succeed",
          p_input: null,
          p_output: output,
          p_error_message: null,
        });

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