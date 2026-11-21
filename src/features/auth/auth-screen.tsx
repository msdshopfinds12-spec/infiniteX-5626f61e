import { useState, type FormEvent } from "react";
import { ArrowRight, Eye, EyeOff, Fingerprint, LockKeyhole, Mail, ShieldCheck, Zap } from "lucide-react";
import type { AuthActions, AuthActionResult } from "./auth-actions.ts";
import { createPasswordRecoveryRedirect, normalizeEmail, validateEmail, validatePassword } from "./auth-actions.ts";

type AuthScreenProps = Readonly<{
  actions: AuthActions;
}>;

type Mode = "sign-in" | "sign-up" | "forgot-password";

function resultMessage(result: AuthActionResult): string {
  if (result.status === "success") return result.message;
  return result.message;
}

export default function AuthScreen({ actions }: AuthScreenProps) {
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const normalizedEmail = normalizeEmail(email);
    const emailError = validateEmail(normalizedEmail);
    const passwordError = mode === "forgot-password"
      ? null
      : validatePassword(password, mode === "sign-up" ? 8 : 1);
    const validationError = emailError ?? passwordError;
    if (validationError) {
      setFeedback({ kind: "error", message: validationError });
      return;
    }
    if (mode === "sign-up" && password !== confirmPassword) {
      setFeedback({ kind: "error", message: "Your passwords do not match." });
      return;
    }

    setBusy(true);
    setFeedback(null);
    try {
      const result = mode === "forgot-password"
        ? await actions.requestPasswordReset(
            normalizedEmail,
            createPasswordRecoveryRedirect(window.location.origin),
          )
        : mode === "sign-in"
          ? await actions.signIn(normalizedEmail, password)
          : await actions.signUp(normalizedEmail, password);
      setFeedback({
        kind: result.status === "success" ? "success" : "error",
        message: resultMessage(result),
      });
      if (result.status === "success" && mode !== "sign-in") {
        setPassword("");
        setConfirmPassword("");
      }
    } catch {
      setFeedback({
        kind: "error",
        message: "Authentication is temporarily unavailable. Please try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-brand">
          <div className="auth-brand-mark"><Zap size={21} aria-hidden="true" /></div>
          <span>INFINITEX <span className="auth-brand-muted">/ WORKSPACE</span></span>
        </div>

        <div className="auth-hero">
          <div className="auth-eyebrow"><ShieldCheck size={14} /> SECURE WORKSPACE ACCESS</div>
          <h1 id="auth-title">{mode === "sign-in" ? "Welcome back." : mode === "sign-up" ? "Build without limits." : "Reset your password."}</h1>
          <p>
            {mode === "sign-in"
              ? "Sign in to continue to your InfiniteX engineering workspace."
              : mode === "sign-up"
                ? "Create your account to start setting up your engineering workspace."
                : "Enter your account email and we will send a secure recovery link if an account exists."}
          </p>
        </div>

        {mode !== "forgot-password" && <div className="auth-tabs" role="tablist" aria-label="Authentication method">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "sign-in"}
            className={mode === "sign-in" ? "auth-tab active" : "auth-tab"}
            onClick={() => { setMode("sign-in"); setFeedback(null); }}
          >
            Sign in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "sign-up"}
            className={mode === "sign-up" ? "auth-tab active" : "auth-tab"}
            onClick={() => { setMode("sign-up"); setFeedback(null); }}
          >
            Create account
          </button>
        </div>}

        <form className="auth-form" data-testid="auth-form" onSubmit={handleSubmit} noValidate>
          <label className="auth-label" htmlFor="auth-email">Email address</label>
          <div className="auth-input-wrap">
            <Mail size={17} aria-hidden="true" />
            <input
              id="auth-email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              maxLength={254}
              disabled={busy}
            />
          </div>

          {mode !== "forgot-password" && <>
          <label className="auth-label" htmlFor="auth-password">Password</label>
          <div className="auth-input-wrap">
            <LockKeyhole size={17} aria-hidden="true" />
            <input
              id="auth-password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
              placeholder="At least 8 characters"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={8}
              maxLength={128}
              disabled={busy}
            />
            <button
              className="auth-visibility"
              type="button"
              aria-label={showPassword ? "Hide password" : "Show password"}
              onClick={() => setShowPassword((value) => !value)}
              disabled={busy}
            >
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>

          {mode === "sign-up" && (
            <>
              <label className="auth-label" htmlFor="auth-confirm-password">Confirm password</label>
              <div className="auth-input-wrap">
                <Fingerprint size={17} aria-hidden="true" />
                <input
                  id="auth-confirm-password"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Re-enter your password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                  minLength={8}
                  maxLength={128}
                  disabled={busy}
                />
              </div>
            </>
          )}

          {mode === "sign-in" && (
            <button className="auth-recovery-link" type="button" onClick={() => { setMode("forgot-password"); setFeedback(null); }}>
              Forgot password?
            </button>
          )}
          </>}

          {feedback && (
            <div className={`auth-feedback ${feedback.kind}`} role={feedback.kind === "error" ? "alert" : "status"}>
              {feedback.message}
            </div>
          )}

          <button className="auth-submit" type="submit" disabled={busy}>
            {busy ? "Please wait…" : mode === "sign-in" ? "Sign in securely" : mode === "sign-up" ? "Create account" : "Send recovery link"}
            {!busy && <ArrowRight size={17} aria-hidden="true" />}
          </button>
        </form>
        {mode === "forgot-password" && (
          <button className="auth-recovery-link" type="button" onClick={() => { setMode("sign-in"); setFeedback(null); }}>
            Back to sign in
          </button>
        )}

        <div className="auth-footnote">
          <LockKeyhole size={13} aria-hidden="true" />
          <span>Your password is sent directly to Supabase Auth over HTTPS. InfiniteX does not store it.</span>
        </div>
        <p className="auth-setup-note">
          Email confirmation and password recovery depend on the Supabase project’s Auth settings.
          Password recovery uses a verified Supabase recovery event; the redirect URL must also be allow-listed in Supabase Auth settings.
        </p>
      </section>
      <aside className="auth-side" aria-label="InfiniteX platform principles">
        <div className="auth-side-grid" aria-hidden="true" />
        <div className="auth-side-content">
          <span className="auth-side-kicker">ENGINEERING, CONNECTED.</span>
          <h2>One workspace.<br /><span>Every stage.</span></h2>
          <p>Plan, build, test and audit with clear boundaries between demo capabilities and verified integrations.</p>
          <div className="auth-side-points">
            <span><ShieldCheck size={16} /> Security-first foundation</span>
            <span><Zap size={16} /> Modular AI engineering</span>
            <span><LockKeyhole size={16} /> Explicit access control</span>
          </div>
        </div>
        <div className="auth-side-footer">INFINITEX ENGINEERING PLATFORM <span>•</span> CONTROLLED ACCESS</div>
      </aside>
    </main>
  );
}
