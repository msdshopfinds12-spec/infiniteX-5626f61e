import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types.ts";
import type { AuthSessionAdapter } from "./auth-session-provider.tsx";
import type { AuthActionResult, AuthActions } from "./auth-actions.ts";

type SupabaseAuthError = Readonly<{
  code?: string;
  status?: number;
  message?: string;
}>;

function toSupabaseAuthError(error: unknown): SupabaseAuthError {
  if (typeof error === "object" && error !== null) {
    const candidate = error as { code?: unknown; status?: unknown; message?: unknown };
    return {
      code: typeof candidate.code === "string" ? candidate.code : undefined,
      status: typeof candidate.status === "number" ? candidate.status : undefined,
      message: typeof candidate.message === "string" ? candidate.message : undefined,
    };
  }
  return { message: typeof error === "string" ? error : undefined };
}

function mapAuthError(error: SupabaseAuthError): AuthActionResult {
  const code = error.code?.toLowerCase() ?? "";
  const message = error.message?.toLowerCase() ?? "";

  if (error.status === 429) {
    return {
      status: "error",
      code: "rate-limited",
      message: "Too many attempts. Please wait a moment before trying again.",
    };
  }

  if (code.includes("weak_password") || message.includes("password should")) {
    return {
      status: "error",
      code: "weak-password",
      message: "Choose a stronger password that meets the account security requirements.",
    };
  }

  if (code.includes("user_already_exists") || message.includes("already registered")) {
    return {
      status: "error",
      code: "email-in-use",
      message: "An account may already exist for this email. Try signing in instead.",
    };
  }

  if (message.includes("email not confirmed") || code.includes("email_not_confirmed")) {
    return {
      status: "error",
      code: "email-not-confirmed",
      message: "Confirm your email address before signing in.",
    };
  }

  if (
    error.status === 400 ||
    code.includes("invalid_credentials") ||
    message.includes("invalid login credentials")
  ) {
    return {
      status: "error",
      code: "invalid-credentials",
      message: "Email or password is incorrect. Check your details and try again.",
    };
  }

  if (
    error.status === 0 ||
    message.includes("failed to fetch") ||
    message.includes("network")
  ) {
    return {
      status: "error",
      code: "network",
      message: "Unable to reach the authentication service. Check your connection and retry.",
    };
  }

  return {
    status: "error",
    code: "unknown",
    message: "Authentication could not be completed. Please try again.",
  };
}

/**
 * Exposes only stable identity and explicit auth actions to the UI.
 * Raw sessions, access tokens, refresh tokens, and provider error text are
 * never copied into React application state or rendered to the user.
 */
export function createSupabaseAuthSessionAdapter(
  client: Pick<SupabaseClient<Database>, "auth">,
): AuthSessionAdapter & AuthActions {
  return {
    async getSession() {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;

      const userId = data.session?.user.id;
      return userId ? { user: { id: userId } } : null;
    },

    onAuthStateChange(listener) {
      const {
        data: { subscription },
      } = client.auth.onAuthStateChange((_event, session) => {
        const userId = session?.user.id;
        listener(userId ? { user: { id: userId } } : null, _event);
      });

      return () => subscription.unsubscribe();
    },

    async signIn(email, password) {
      try {
        const { error } = await client.auth.signInWithPassword({ email, password });
        if (error) return mapAuthError(error);
        return { status: "success", message: "You are signed in." };
      } catch (error) {
        return mapAuthError(toSupabaseAuthError(error));
      }
    },

    async signUp(email, password) {
      try {
        const { data, error } = await client.auth.signUp({ email, password });
        if (error) return mapAuthError(error);

        if (data.session) {
          return { status: "success", message: "Your account is ready." };
        }

        return {
          status: "success",
          message: "Account request received. Check your email for the confirmation link before signing in.",
        };
      } catch (error) {
        return mapAuthError(toSupabaseAuthError(error));
      }
    },

    async requestPasswordReset(email, redirectTo) {
      try {
        const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
        if (error) return mapAuthError(error);
        // Avoid account enumeration: the same message is returned whether or not
        // the address belongs to an account.
        return {
          status: "success",
          message: "If an account exists for that email, a password reset link will be sent.",
        };
      } catch (error) {
        return mapAuthError(toSupabaseAuthError(error));
      }
    },

    async updatePassword(password) {
      try {
        const { error } = await client.auth.updateUser({ password });
        if (error) return mapAuthError(error);
        return {
          status: "success",
          message: "Your password has been updated. You can continue to your workspace.",
        };
      } catch (error) {
        return mapAuthError(toSupabaseAuthError(error));
      }
    },

    async signOut() {
      try {
        const { error } = await client.auth.signOut();
        if (error) return mapAuthError(error);
        return { status: "success", message: "You have been signed out." };
      } catch (error) {
        return mapAuthError(toSupabaseAuthError(error));
      }
    },
  };
}
