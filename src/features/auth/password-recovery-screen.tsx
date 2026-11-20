import { useState, type FormEvent } from "react";
import { ArrowRight, LockKeyhole, ShieldCheck } from "lucide-react";
import type { AuthActions } from "./auth-actions.ts";
import { validatePassword } from "./auth-actions.ts";

type PasswordRecoveryScreenProps = Readonly<{
  actions: AuthActions;
}>;

export default function PasswordRecoveryScreen({ actions }: PasswordRecoveryScreenProps) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [updated, setUpdated] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || updated) return;

    const validationError = validatePassword(password, 8);
    if (validationError) {
      setFeedback(validationError);
      return;
    }
    if (password !== confirmation) {
      setFeedback("Your passwords do not match.");
      return;
    }

    setBusy(true);
    setFeedback(null);
    try {
      const result = await actions.updatePassword(password);
      if (result.status === "success") {
        setUpdated(true);
        setPassword("");
        setConfirmation("");
        setFeedback(result.message);
      } else {
        setFeedback(result.message);
      }
    } catch {
      setFeedback("Password update is temporarily unavailable. Request a new recovery link if this continues.");
    } finally {
      setBusy(false);
    }
  }

  async function continueToSignIn() {
    setBusy(true);
    setFeedback(null);
    try {
      const result = await actions.signOut();
      if (result.status === "error") setFeedback(result.message);
    } catch {
      setFeedback("Unable to finish the recovery session. Please refresh and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-status-page">
      <section className="auth-recovery-card" aria-labelledby="recovery-title">
        <div className="auth-brand-mark"><ShieldCheck size={21} aria-hidden="true" /></div>
        <p className="auth-eyebrow">SECURE ACCOUNT RECOVERY</p>
        <h1 id="recovery-title">{updated ? "Password updated." : "Choose a new password."}</h1>
        <p className="auth-recovery-copy">
          {updated
            ? "Your password has been changed. Sign out of this recovery session before signing in again."
            : "The recovery link has been accepted. Set a new password to secure your account."}
        </p>

        {!updated ? (
          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            <label className="auth-label" htmlFor="recovery-password">New password</label>
            <div className="auth-input-wrap">
              <LockKeyhole size={17} aria-hidden="true" />
              <input
                id="recovery-password"
                name="newPassword"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={8}
                maxLength={128}
                required
                disabled={busy}
              />
            </div>
            <label className="auth-label" htmlFor="recovery-confirmation">Confirm new password</label>
            <div className="auth-input-wrap">
              <LockKeyhole size={17} aria-hidden="true" />
              <input
                id="recovery-confirmation"
                name="confirmNewPassword"
                type="password"
                autoComplete="new-password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                minLength={8}
                maxLength={128}
                required
                disabled={busy}
              />
            </div>
            {feedback && <div className="auth-feedback error" role="alert">{feedback}</div>}
            <button className="auth-submit" type="submit" disabled={busy}>
              {busy ? "Updating…" : "Update password"} {!busy && <ArrowRight size={17} aria-hidden="true" />}
            </button>
          </form>
        ) : (
          <>
            {feedback && <div className="auth-feedback success" role="status">{feedback}</div>}
            <button className="auth-submit" type="button" onClick={continueToSignIn} disabled={busy}>
              {busy ? "Finishing…" : "Continue to sign in"}
              {!busy && <ArrowRight size={17} aria-hidden="true" />}
            </button>
          </>
        )}
        <p className="auth-setup-note">Never share your recovery link or verification code. InfiniteX does not display or store your password.</p>
      </section>
    </main>
  );
}
