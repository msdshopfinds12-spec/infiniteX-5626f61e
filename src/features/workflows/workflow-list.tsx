import { useEffect, useState } from "react";
import type { WorkflowReadResult, WorkflowReadService } from "./workflow-read-service.ts";

type WorkflowListState =
  | Readonly<{ key: string; status: "loading" }>
  | Readonly<{ key: string; status: "success"; result: Extract<WorkflowReadResult, { status: "success" }> }>
  | Readonly<{ key: string; status: "error"; code: string }>;

type WorkflowListProps = Readonly<{
  service: WorkflowReadService | null;
  userId: string;
  identityEpoch: number;
  searchTerm?: string;
}>;

/**
 * Read-only live workflow list. The request key fences results across account
 * switches; a previous user's data is never rendered under a new identity.
 */
export default function WorkflowList({
  service,
  userId,
  identityEpoch,
  searchTerm = "",
}: WorkflowListProps) {
  const requestKey = userId + ":" + identityEpoch;
  const [state, setState] = useState<WorkflowListState>({
    key: "",
    status: "loading",
  });

  useEffect(() => {
    let active = true;
    setState({ key: requestKey, status: "loading" });

    if (!service) {
      setState({ key: requestKey, status: "error", code: "service_unavailable" });
      return () => { active = false; };
    }

    void service.listOwnWorkflows({ limit: 50 }).then((result) => {
      if (!active) return;
      if (result.status === "success") {
        setState({ key: requestKey, status: "success", result });
      } else {
        setState({ key: requestKey, status: "error", code: result.code });
      }
    });

    return () => { active = false; };
  }, [service, requestKey]);

  const currentState = state.key === requestKey
    ? state
    : ({ key: requestKey, status: "loading" } as const);

  if (currentState.status === "loading") {
    return <p className="muted" role="status">Loading your workflows…</p>;
  }

  if (currentState.status === "error") {
    return (
      <p className="workflow-state-error" role="alert">
        Your workflows could not be loaded. Check your connection and try again. ({currentState.code})
      </p>
    );
  }

  const query = searchTerm.trim().toLocaleLowerCase();
  const workflows = currentState.result.data.filter((workflow) =>
    !query || workflow.name.toLocaleLowerCase().includes(query) ||
      (workflow.description ?? "").toLocaleLowerCase().includes(query)
  );

  if (workflows.length === 0) {
    return (
      <p className="muted" role="status">
        {currentState.result.data.length === 0
          ? "No workflows found for this account yet."
          : "No workflows match your search."}
      </p>
    );
  }

  return (
    <ul className="workflow-list" aria-label="Your workflows">
      {workflows.map((workflow) => (
        <li className="workflow-row" key={workflow.id}>
          <div className="workflow-copy">
            <span className="workflow-title">{workflow.name}</span>
            <span className="workflow-description">{workflow.description || "No description provided"}</span>
            <span className="workflow-meta">
              {workflow.trigger_type} · Updated {new Date(workflow.updated_at).toLocaleDateString()}
            </span>
          </div>
          <span className="badge badge-neutral">{workflow.status}</span>
        </li>
      ))}
    </ul>
  );
}
