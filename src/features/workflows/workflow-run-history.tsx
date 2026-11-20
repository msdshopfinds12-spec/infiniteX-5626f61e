import { useEffect, useState } from "react";
import type { WorkflowReadService, WorkflowRunReadResult } from "./workflow-read-service.ts";

type State =
  | Readonly<{ key: string; status: "loading" }>
  | Readonly<{ key: string; status: "success"; result: Extract<WorkflowRunReadResult, { status: "success" }> }>
  | Readonly<{ key: string; status: "error"; code: string }>;

type Props = Readonly<{
  service: WorkflowReadService | null;
  workflowId: string;
  userId: string;
  identityEpoch: number;
}>;

function formatTime(value: string | null): string {
  if (!value) return "Not recorded";
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? "Time unavailable" : timestamp.toLocaleString();
}

/** Displays only safe run metadata; input, output and raw error text stay hidden. */
export default function WorkflowRunHistory({
  service,
  workflowId,
  userId,
  identityEpoch,
}: Props) {
  const requestKey = [userId, identityEpoch, workflowId].join(":");
  const [retryCount, setRetryCount] = useState(0);
  const [state, setState] = useState<State>({ key: "", status: "loading" });

  useEffect(() => {
    let active = true;
    setState({ key: requestKey, status: "loading" });

    if (!service) {
      setState({ key: requestKey, status: "error", code: "service_unavailable" });
      return () => { active = false; };
    }

    void service.listWorkflowRuns(workflowId, { limit: 10 }).then((result) => {
      if (!active) return;
      if (result.status === "success") {
        setState({ key: requestKey, status: "success", result });
      } else {
        setState({ key: requestKey, status: "error", code: result.code });
      }
    });

    return () => { active = false; };
  }, [service, requestKey, workflowId, retryCount]);

  const currentState = state.key === requestKey
    ? state
    : ({ key: requestKey, status: "loading" } as const);

  if (currentState.status === "loading") {
    return <p className="muted" role="status">Loading recent runs…</p>;
  }

  if (currentState.status === "error") {
    return (
      <div className="workflow-state-error" role="alert">
        <p>Run history could not be loaded ({currentState.code}).</p>
        <button className="btn btn-ghost" type="button" onClick={() => setRetryCount((count) => count + 1)}>
          Retry
        </button>
      </div>
    );
  }

  if (currentState.result.data.length === 0) {
    return <p className="muted" role="status">No runs have been recorded for this workflow.</p>;
  }

  return (
    <ul className="workflow-run-list" aria-label="Recent workflow runs">
      {currentState.result.data.map((run) => (
        <li className="workflow-run-row" key={run.id}>
          <div>
            <strong>{run.status}</strong>
            <span className="workflow-meta">Attempt {run.attempt} · Created {formatTime(run.created_at)}</span>
          </div>
          <span className="workflow-meta">
            {run.finished_at ? "Finished " + formatTime(run.finished_at) : "Not finished"}
          </span>
        </li>
      ))}
    </ul>
  );
}
