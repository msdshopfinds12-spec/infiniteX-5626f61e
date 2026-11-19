import { createClient } from "npm:@supabase/supabase-js@2";
import { assert, assertEquals } from "jsr:@std/assert@1";

const url = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const runId = Deno.env.get("PHASE_4N8B_TEST_RUN_ID");
const stepId = Deno.env.get("PHASE_4N8B_TEST_STEP_ID");
const ownerId = Deno.env.get("PHASE_4N8B_TEST_OWNER_ID");
const attemptValue = Deno.env.get("PHASE_4N8B_TEST_ATTEMPT");
const attempt = Number(attemptValue);
const configured = Boolean(url && serviceRoleKey && runId && stepId && ownerId
  && Number.isInteger(attempt) && attempt > 0);

Deno.test({
  name: "Phase 4N.8B serializes concurrent starts and rejects stale completion",
  ignore: !configured,
  fn: async () => {
    const admin = createClient(url!, serviceRoleKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: run, error: runReadError } = await admin
      .from("workflow_runs")
      .select("id,owner_id,status,attempt")
      .eq("id", runId!)
      .maybeSingle();
    assert(!runReadError, runReadError?.message ?? "run_fixture_read_failed");
    assert(run, "run_fixture_missing");
    assertEquals(run.owner_id, ownerId);
    assertEquals(run.status, "running");
    assertEquals(run.attempt, attempt);

    const { data: step, error: stepReadError } = await admin
      .from("workflow_steps")
      .select("id,workflow_id")
      .eq("id", stepId!)
      .maybeSingle();
    assert(!stepReadError, stepReadError?.message ?? "step_fixture_read_failed");
    assert(step, "step_fixture_missing");

    const args = {
      p_run_id: runId!,
      p_step_id: stepId!,
      p_owner_id: ownerId!,
      p_attempt: attempt,
      p_transition: "start",
      p_input: { fixture: "phase-4n8b" },
      p_output: null,
      p_error_message: null,
    };

    const starts = await Promise.all([
      admin.rpc("simula_transition_workflow_step", args),
      admin.rpc("simula_transition_workflow_step", args),
    ]);
    const winners = starts.filter((result) => !result.error && typeof result.data === "string");
    const losers = starts.filter((result) => result.error);
    assertEquals(winners.length, 1, "exactly one concurrent start must win");
    assertEquals(losers.length, 1, "the duplicate same-generation start must be rejected");

    const { error: bumpError } = await admin
      .from("workflow_runs")
      .update({ attempt: attempt + 1 })
      .eq("id", runId!)
      .eq("owner_id", ownerId!)
      .eq("status", "running")
      .eq("attempt", attempt);
    assert(!bumpError, bumpError?.message ?? "fixture_generation_bump_failed");

    const staleFinish = await admin.rpc("simula_transition_workflow_step", {
      ...args,
      p_transition: "succeed",
      p_input: null,
      p_output: { fixture: "stale-worker-must-not-commit" },
    });
    assert(staleFinish.error, "old generation must not finish after parent generation changes");
    assert(
      staleFinish.error.message.includes("superseded"),
      "stale completion should report attempt superseded",
    );
  },
});

function isLocalSupabaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:"
      && ["localhost", "127.0.0.1"].includes(url.hostname)
      && url.username.length === 0
      && url.password.length === 0;
  } catch {
    return false;
  }
}

const configuredUrl = Deno.env.get("SUPABASE_URL") ?? "";
if (configuredUrl && !isLocalSupabaseUrl(configuredUrl)) {
  throw new Error("integration_test_requires_local_supabase_url");
}

Deno.test("accepts only loopback HTTP Supabase URLs for mutating fixtures", () => {
  assert(isLocalSupabaseUrl("http://localhost:54321"));
  assert(isLocalSupabaseUrl("http://127.0.0.1:54321"));
  assert(!isLocalSupabaseUrl("https://example.supabase.co"));
  assert(!isLocalSupabaseUrl("http://example.supabase.co"));
  assert(!isLocalSupabaseUrl("http://user:secret@localhost:54321"));
});
