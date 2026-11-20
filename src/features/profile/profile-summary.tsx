import { useEffect, useState } from "react";
import type { ProfileReadResult, ProfileReadService } from "./profile-read-service.ts";

type State =
  | Readonly<{ key: string; status: "loading" }>
  | Readonly<{ key: string; status: "success"; result: Extract<ProfileReadResult, { status: "success" }> }>
  | Readonly<{ key: string; status: "error"; code: string }>;

type Props = Readonly<{
  service: ProfileReadService | null;
  userId: string;
  identityEpoch: number;
}>;

function formatMemberDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : new Intl.DateTimeFormat(undefined, { dateStyle: "long" }).format(date);
}

/** Read-only account profile summary; does not expose role or editable fields. */
export default function ProfileSummary({ service, userId, identityEpoch }: Props) {
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

    void service.getOwnProfile().then((result) => {
      if (!active) return;
      if (result.status === "success") {
        setState({ key: requestKey, status: "success", result });
      } else {
        setState({ key: requestKey, status: "error", code: result.code });
      }
    });

    return () => { active = false; };
  }, [service, userId, requestKey, retryCount]);

  const currentState = state.key === requestKey
    ? state
    : ({ key: requestKey, status: "loading" } as const);

  if (currentState.status === "loading") {
    return <p className="muted" role="status">Loading your account profile…</p>;
  }

  if (currentState.status === "error") {
    return (
      <div className="workflow-state-error" role="alert">
        <p>Your profile could not be loaded ({currentState.code}).</p>
        <button className="btn btn-ghost" type="button" onClick={() => setRetryCount((count) => count + 1)}>
          Retry
        </button>
      </div>
    );
  }

  const profile = currentState.result.data;
  if (!profile) {
    return (
      <p className="muted" role="status">
        Your account is authenticated, but no profile record is available yet.
      </p>
    );
  }

  return (
    <dl className="profile-summary">
      <div>
        <dt>Display name</dt>
        <dd>{profile.display_name?.trim() || "Not set"}</dd>
      </div>
      <div>
        <dt>Member since</dt>
        <dd>{formatMemberDate(profile.created_at)}</dd>
      </div>
      <div>
        <dt>Profile last updated</dt>
        <dd>{formatMemberDate(profile.updated_at)}</dd>
      </div>
    </dl>
  );
}
