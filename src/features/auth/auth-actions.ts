export type AuthActionResult =
  | Readonly<{ status: "success"; message: string }>
  | Readonly<{
      status: "error";
      code:
        | "invalid-credentials"
        | "email-not-confirmed"
        | "email-in-use"
        | "weak-password"
        | "rate-limited"
        | "network"
        | "unknown";
      message: string;
    }>;

export type AuthActions = Readonly<{
  signIn: (email: string, password: string) => Promise<AuthActionResult>;
  signUp: (email: string, password: string) => Promise<AuthActionResult>;
  signOut: () => Promise<AuthActionResult>;
}>;

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function validateCredentials(email: string, password: string): string | null {
  const normalizedEmail = normalizeEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return "Enter a valid email address.";
  }
  if (password.length < 8) {
    return "Password must contain at least 8 characters.";
  }
  if (password.length > 128) {
    return "Password must be 128 characters or fewer.";
  }
  return null;
}
