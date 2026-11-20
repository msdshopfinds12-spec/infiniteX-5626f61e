import { useEffect, useState } from "react";
import type { WorkflowLogReadResult, WorkflowReadService } from "./workflow-read-service.ts";

type State =
  | Readonly<{ key: string; status: "loading" }>
  | Readonly<{ key: string; status: "success"; result: Extract<WorkflowLogReadResult, { status: "success" }> }>
  | Readonly<{ key: string; status: "error"; code: string }>;

type Props = Readonly<{
  service: WorkflowReadService | null;
  runId: string;
  userId: string;
  identityEpoch: number;
}>;

/** Shows safe event metadata only; JSON details and arbitrary payloads are never queried. */
export default function WorkflowLogList({ service, runId, userId, identityEpoch }: Props) {
  const requestKey = [userId, identityEpoch, runId].join(":");
  const [retryCount, setRetryCount] = useState(0);
  const [state, setState] = useState<State>({ key: "", status: "loading" });

  useEffect(() => {
    let active = true;
    setState({ key: requestKey, status: "loading" });

    if (!service) {
      setState({ key: requestKey, status: "error", code: "service_unavailable" });
      return () => { active = false; };
    }

    void service.listRunLogs(runId, { limit: 50 }).then((result) => {
      if (!active) return;
      if (result.status === "success") {
        setState({ key: requestKey, status: "success", result });
      } else {
        setState({ key: requestKey, status: "error", code: result.code });
      }
    });

    return () => { active = false; };
  }, [service, requestKey, runId, retryCount]);

  const currentState = state.key === requestKey
    ? state
    : ({ key: requestKey, status: "loading" } as const);

  if (currentState.status === "loading") {
    return <p className="muted" role="status">Loading run events…</p>;
  }

  if (currentState.status === "error") {
    return (
      <div className="workflow-state-error" role="alert">
        <p>Run events could not be loaded ({currentState.code}).</p>
        <button className="btn btn-ghost" type="button" onClick={() => setRetryCount((count) => count + 1)}>
          Retry
        </button>
      </div>
    );
  }

  if (currentState.result.data.length === 0) {
    return <p className="muted" role="status">No event metadata has been recorded for this run.</p>;
  }

  return (
    <ul className="workflow-event-list" aria-label="Run event timeline">
      {currentState.result.data.map((event) => (
        <li className="workflow-event-row" key={event.id}>
          <span className="workflow-event-level">{event.level}</span>
          <span className="workflow-event-name">{event.event}</span>
          <time className="workflow-meta" dateTime={event.created_at}>
            {new Date(event.created_at).toLocaleString()}
          </time>
        </li>
      ))}
    </ul>
  );
}
