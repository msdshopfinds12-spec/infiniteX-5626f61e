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

export function validateEmail(value: string): string | null {
  const email = normalizeEmail(value);
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "Enter a valid email address.";
  }
  return null;
}

export function validatePassword(value: string, minimumLength = 8): string | null {
  if (value.length < minimumLength) {
    return `Password must contain at least ${minimumLength} characters.`;
  }
  if (value.length > 128) {
    return "Password must be 128 characters or fewer.";
  }
  return null;
}
