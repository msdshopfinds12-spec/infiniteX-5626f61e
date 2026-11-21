import { useEffect, useState } from "react";
import type { WorkflowReadService, WorkflowRunReadResult } from "./workflow-read-service.ts";
import WorkflowLogList from "./workflow-log-list";
import { hasActiveWorkflowRuns, WORKFLOW_RUN_POLL_INTERVAL_MS } from "./workflow-run-polling.ts";

type State =
  | Readonly<{ key: string; status: "loading" }>
  | Readonly<{ key: string; status: "success"; result: Extract<WorkflowRunReadResult, { status: "success" }> }>
  | Readonly<{ key: string; status: "error"; code: string }>;

type Props = Readonly<{
  service: WorkflowReadService | null;
  workflowId: string;
  userId: string;
  identityEpoch: number;
  refreshToken?: number;
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
  refreshToken = 0,
}: Props) {
  const requestKey = [userId, identityEpoch, workflowId].join(":");
  const [retryCount, setRetryCount] = useState(0);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
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
    }).catch(() => {
      if (active) setState({ key: requestKey, status: "error", code: "request_failed" });
    });

    return () => { active = false; };
  }, [service, requestKey, workflowId, retryCount, refreshToken]);

  const currentState = state.key === requestKey
    ? state
    : ({ key: requestKey, status: "loading" } as const);

  const shouldPoll = currentState.status === "success" &&
    hasActiveWorkflowRuns(currentState.result.data);

  // Poll only non-terminal runs. A hidden tab pauses network traffic; becoming
  // visible triggers one immediate refresh. The fetch effect's active flag
  // fences late responses after identity changes or unmount.
  useEffect(() => {
    if (!shouldPoll) return;

    let timer: number | undefined;
    let disposed = false;
    const clearTimer = () => {
      if (timer !== undefined) {
        window.clearTimeout(timer);
        timer = undefined;
      }
    };
    const refresh = () => {
      if (!disposed && document.visibilityState === "visible") {
        clearTimer();
        setRetryCount((count) => count + 1);
      }
    };
    const schedule = () => {
      if (disposed || document.visibilityState !== "visible") return;
      clearTimer();
      timer = window.setTimeout(refresh, WORKFLOW_RUN_POLL_INTERVAL_MS);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refresh();
      else clearTimer();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    schedule();
    return () => {
      disposed = true;
      clearTimer();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [shouldPoll, requestKey, retryCount]);

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
    <>
      <div className="workflow-run-history-toolbar">
        <span className="workflow-meta" role="status" aria-live="polite">
          {shouldPoll
            ? "Live status refresh · every 5 seconds while runs are active"
            : "Run history is up to date"}
        </span>
        <button className="btn btn-ghost" type="button" onClick={() => setRetryCount((count) => count + 1)}>
          Refresh now
        </button>
      </div>
      <ul className="workflow-run-list" aria-label="Recent workflow runs">
      {currentState.result.data.map((run) => {
        const expanded = expandedRunId === run.id;
        const eventListId = "workflow-events-" + run.id;
        return (
          <li className="workflow-run-item" key={run.id}>
            <div className="workflow-run-row">
              <div>
                <strong>{run.status}</strong>
                <span className="workflow-meta">Attempt {run.attempt} · Created {formatTime(run.created_at)}</span>
              </div>
              <div className="workflow-run-actions">
                <span className="workflow-meta">
                  {run.finished_at ? "Finished " + formatTime(run.finished_at) : "Not finished"}
                </span>
                <button
                  className="btn btn-ghost"
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={expanded ? eventListId : undefined}
                  onClick={() => setExpandedRunId(expanded ? null : run.id)}
                >
                  {expanded ? "Hide events" : "Events"}
                </button>
              </div>
            </div>
            {expanded && (
              <div className="workflow-event-history" id={eventListId}>
                <WorkflowLogList
                  service={service}
                  runId={run.id}
                  userId={userId}
                  identityEpoch={identityEpoch}
                />
              </div>
            )}
          </li>
        );
      })}
      </ul>
    </>
  );
}
