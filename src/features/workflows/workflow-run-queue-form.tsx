import { useState } from "react";
import type { Json } from "../../lib/supabase/database.types.ts";
import { createWorkflowRunRequest } from "./workflow-run-request.ts";
import type { WorkflowRunService } from "./workflow-run-service.ts";

type QueueState =
  | Readonly<{ status: "idle" }>
  | Readonly<{ status: "submitting"; requestId: string; inputText: string }>
  | Readonly<{ status: "error"; requestId: string; inputText: string; code: string }>
  | Readonly<{ status: "queued"; runId: string; replayed: boolean }>;

type Props = Readonly<{
  workflowId: string;
  workflowStatus: string;
  service: WorkflowRunService | null;
  onQueued: () => void;
}>;

export default function WorkflowRunQueueForm({
  workflowId,
  workflowStatus,
  service,
  onQueued,
}: Props) {
  const [inputText, setInputText] = useState("{}");
  const [state, setState] = useState<QueueState>({ status: "idle" });
  const [inputError, setInputError] = useState<string | null>(null);

  async function submit(input: string, requestId: string) {
    if (!service) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(input);
    } catch {
      setInputError("Enter valid JSON before queueing this workflow.");
      setState({ status: "idle" });
      return;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      setInputError("Workflow input must be a JSON object, for example {}.");
      setState({ status: "idle" });
      return;
    }

    setInputError(null);
    setState({ status: "submitting", requestId, inputText: input });
    let request;
    try {
      request = createWorkflowRunRequest(workflowId, parsed as Json);
    } catch {
      setState({ status: "error", requestId, inputText: input, code: "invalid_input" });
      return;
    }

    const result = await service.enqueue(request, requestId);
    if (result.status === "success") {
      setState({
        status: "queued",
        runId: result.run.id,
        replayed: result.run.replayed,
      });
      setInputText("{}");
      onQueued();
      return;
    }
    setState({
      status: "error",
      requestId,
      inputText: input,
      code: result.code,
    });
  }

  function startNewRequest() {
    setInputError(null);
    setState({ status: "idle" });
  }

  const isActive = workflowStatus === "active";
  const isSubmitting = state.status === "submitting";
  const isRetryPending = state.status === "error";

  return (
    <section className="workflow-run-queue" aria-label="Queue workflow run">
      <label className="workflow-run-input-label" htmlFor={"workflow-input-" + workflowId}>
        Run input (JSON object)
      </label>
      <textarea
        id={"workflow-input-" + workflowId}
        className="workflow-run-input"
        rows={3}
        value={inputText}
        disabled={!service || !isActive || isSubmitting || isRetryPending}
        spellCheck={false}
        onChange={(event) => setInputText(event.target.value)}
        aria-describedby={"workflow-queue-help-" + workflowId}
      />
      <p className="workflow-queue-help" id={"workflow-queue-help-" + workflowId}>
        Queueing stores a run request. It does not confirm that the worker has executed it.
      </p>

      {!service && (
        <p className="workflow-queue-message" role="status">
          Queueing is disabled until the Phase 84 database migration and Edge Function are deployed and verified.
        </p>
      )}
      {service && !isActive && (
        <p className="workflow-queue-message" role="status">
          Only active workflows can be queued.
        </p>
      )}
      {inputError && <p className="workflow-queue-error" role="alert">{inputError}</p>}
      {state.status === "submitting" && (
        <p className="workflow-queue-message" role="status">Submitting an idempotent queue request…</p>
      )}
      {state.status === "error" && (
        <div className="workflow-queue-error" role="alert">
          <p>Queue request was not confirmed ({state.code}). Retry uses the same request ID and input to avoid duplicate runs.</p>
          <div className="workflow-queue-actions">
            <button className="btn btn-primary" type="button" onClick={() => void submit(state.inputText, state.requestId)}>
              Retry same request
            </button>
            <button className="btn btn-ghost" type="button" onClick={startNewRequest}>
              Start a new request
            </button>
          </div>
          <p className="workflow-queue-help">If the previous response was lost, check run history before starting a new request.</p>
        </div>
      )}
      {state.status === "queued" && (
        <p className="workflow-queue-success" role="status">
          {state.replayed ? "Existing request confirmed" : "Run queued"} · {state.runId}. Worker execution is not yet confirmed.
        </p>
      )}

      {state.status !== "error" && (
        <div className="workflow-queue-actions">
          <button
            className="btn btn-primary"
            type="button"
            disabled={!service || !isActive || isSubmitting}
            onClick={() => {
              let requestId: string;
              try {
                requestId = crypto.randomUUID();
              } catch {
                setInputError("A secure request ID could not be generated in this browser.");
                return;
              }
              void submit(inputText, requestId);
            }}
          >
            {isSubmitting ? "Queueing…" : "Queue run"}
          </button>
        </div>
      )}
    </section>
  );
}
