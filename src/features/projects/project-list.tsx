import { useEffect, useState } from "react";
import type { ProjectReadResult, ProjectReadService } from "./project-read-service.ts";

type State =
  | Readonly<{ key: string; status: "loading" }>
  | Readonly<{ key: string; status: "success"; result: Extract<ProjectReadResult, { status: "success" }> }>
  | Readonly<{ key: string; status: "error"; code: string }>;

type Props = Readonly<{
  service: ProjectReadService | null;
  userId: string;
  identityEpoch: number;
  searchTerm?: string;
}>;

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

/** Read-only project index; project JSON content is never requested or rendered. */
export default function ProjectList({
  service,
  userId,
  identityEpoch,
  searchTerm = "",
}: Props) {
  const requestKey = userId + ":" + identityEpoch;
  const [retryCount, setRetryCount] = useState(0);
  const [state, setState] = useState<State>({ key: "", status: "loading" });

  useEffect(() => {
    let active = true;
    setState({ key: requestKey, status: "loading" });

    if (!service) {
      setState({ key: requestKey, status: "error", code: "service_unavailable" });
      return () => { active = false; };
    }

    void service.listOwnProjects({ limit: 50 }).then((result) => {
      if (!active) return;
      if (result.status === "success") {
        setState({ key: requestKey, status: "success", result });
      } else {
        setState({ key: requestKey, status: "error", code: result.code });
      }
    }).catch(() => {
      // Defend the UI boundary even if an injected adapter violates its result contract.
      if (active) setState({ key: requestKey, status: "error", code: "request_failed" });
    });

    return () => { active = false; };
  }, [service, requestKey, retryCount]);

  const currentState = state.key === requestKey
    ? state
    : ({ key: requestKey, status: "loading" } as const);

  if (currentState.status === "loading") {
    return <p className="muted" role="status">Loading your projects…</p>;
  }

  if (currentState.status === "error") {
    return (
      <div className="workflow-state-error" role="alert">
        <p>Your projects could not be loaded ({currentState.code}).</p>
        <button className="btn btn-ghost" type="button" onClick={() => setRetryCount((count) => count + 1)}>
          Retry
        </button>
      </div>
    );
  }

  const query = searchTerm.trim().toLocaleLowerCase();
  const projects = currentState.result.data.filter((project) =>
    !query || project.title.toLocaleLowerCase().includes(query) ||
      project.project_type.toLocaleLowerCase().includes(query)
  );

  if (projects.length === 0) {
    return (
      <p className="muted" role="status">
        {currentState.result.data.length === 0
          ? "No saved projects are available for this account yet."
          : "No projects match your search."}
      </p>
    );
  }

  return (
    <ul className="project-list" aria-label="Your saved projects">
      {projects.map((project) => (
        <li className="project-card" key={project.id}>
          <div className="project-card-heading">
            <strong>{project.title}</strong>
            <span className="badge badge-neutral">{project.project_type}</span>
          </div>
          <div className="project-card-dates">
            <span>Created {formatDate(project.created_at)}</span>
            <span>Updated {formatDate(project.updated_at)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
