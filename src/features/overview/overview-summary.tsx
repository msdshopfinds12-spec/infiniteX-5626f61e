import { useEffect, useState } from "react";
import { FolderKanban, GitBranch, RefreshCw } from "lucide-react";
import type { ProjectReadService } from "../projects/project-read-service.ts";
import type { WorkflowReadService } from "../workflows/workflow-read-service.ts";
import { readOverviewSnapshot, type OverviewSnapshot } from "./overview-snapshot.ts";

type State =
  | Readonly<{ key: string; status: "loading" }>
  | Readonly<{ key: string; status: "ready"; snapshot: OverviewSnapshot }>;

type Props = Readonly<{
  userId: string;
  identityEpoch: number;
  workflowService: WorkflowReadService | null;
  projectService: ProjectReadService | null;
}>;

function SnapshotCard({
  label,
  value,
  error,
  icon: Icon,
}: {
  label: string;
  value: number | null;
  error: string | null;
  icon: typeof GitBranch;
}) {
  return (
    <article className="overview-stat">
      <div className="overview-stat-icon"><Icon size={18} aria-hidden="true" /></div>
      <div className="overview-stat-copy">
        <span className="overview-stat-label">{label}</span>
        <strong className="overview-stat-value" aria-live="polite">
          {value === null ? "—" : value.toLocaleString()}
        </strong>
        <span className="overview-stat-meta">
          {error ? `Unavailable (${error})` : "Live account records · read only"}
        </span>
      </div>
    </article>
  );
}

/**
 * Account overview with bounded metadata reads only. State is keyed to the
 * authenticated identity epoch so stale account data is never shown after
 * sign-out or account switching.
 */
export default function OverviewSummary({
  userId,
  identityEpoch,
  workflowService,
  projectService,
}: Props) {
  const requestKey = userId + ":" + identityEpoch;
  const [retryCount, setRetryCount] = useState(0);
  const [state, setState] = useState<State>({ key: "", status: "loading" });

  useEffect(() => {
    let active = true;
    setState({ key: requestKey, status: "loading" });

    void readOverviewSnapshot(workflowService, projectService).then((snapshot) => {
      if (active) setState({ key: requestKey, status: "ready", snapshot });
    }).catch(() => {
      if (active) {
        setState({
          key: requestKey,
          status: "ready",
          snapshot: {
            workflowCount: null,
            projectCount: null,
            workflowError: "request_failed",
            projectError: "request_failed",
          },
        });
      }
    });

    return () => { active = false; };
  }, [requestKey, workflowService, projectService, retryCount]);

  const current = state.key === requestKey ? state : { key: requestKey, status: "loading" as const };

  return (
    <section className="overview-section" aria-labelledby="overview-data-title">
      <div className="overview-section-heading">
        <div>
          <span className="overview-eyebrow">ACCOUNT OVERVIEW</span>
          <h2 id="overview-data-title">Your workspace, at a glance</h2>
          <p>Counts come from authenticated, read-only account queries protected by database RLS.</p>
        </div>
        <button
          className="btn btn-ghost overview-refresh"
          type="button"
          onClick={() => setRetryCount((count) => count + 1)}
          disabled={current.status === "loading"}
          aria-label="Refresh workspace overview"
        >
          <RefreshCw size={15} aria-hidden="true" />
          Refresh
        </button>
      </div>

      {current.status === "loading" ? (
        <div className="overview-loading" role="status">Loading your account overview…</div>
      ) : (
        <div className="overview-stats">
          <SnapshotCard
            label="Your workflows"
            value={current.snapshot.workflowCount}
            error={current.snapshot.workflowError}
            icon={GitBranch}
          />
          <SnapshotCard
            label="Saved projects"
            value={current.snapshot.projectCount}
            error={current.snapshot.projectError}
            icon={FolderKanban}
          />
        </div>
      )}
      <p className="overview-footnote">
        This panel does not report agent activity, run execution, token usage, uptime, or security scan results.
      </p>
    </section>
  );
}
