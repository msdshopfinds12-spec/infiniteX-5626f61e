import { readSessionCookie } from "./cookie-policy.mjs";
import { isTrustedMutationOrigin, verifyCsrfToken } from "./csrf.mjs";

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export async function resolveRequestPrincipal(req, {
  sessionService,
  cookieName = "__Host-infinite_x_session"
}) {
  if (!sessionService || typeof sessionService.resolve !== "function") {
    throw new TypeError("A session service is required");
  }
  const token = readSessionCookie(req?.headers?.cookie, cookieName);
  if (!token) return Object.freeze({ authenticated: false, reason: "SESSION_MISSING" });

  // Repository failures intentionally propagate so the HTTP boundary can fail closed with 503.
  const session = await sessionService.resolve(token);
  if (!session || session.active !== true ||
      typeof session.userId !== "string" ||
      typeof session.csrfTokenHash !== "string") {
    return Object.freeze({ authenticated: false, reason: "SESSION_INVALID" });
  }

  return Object.freeze({
    authenticated: true,
    principal: Object.freeze({ userId: session.userId, active: true }),
    session: Object.freeze({
      csrfTokenHash: session.csrfTokenHash,
      expiresAt: session.expiresAt
    })
  });
}

export function verifyMutationRequest(req, {
  session,
  allowedOrigins
}) {
  const method = typeof req?.method === "string" ? req.method.toUpperCase() : "";
  if (SAFE_METHODS.has(method)) return Object.freeze({ allowed: true });
  if (!MUTATION_METHODS.has(method)) {
    return Object.freeze({ allowed: false, reason: "METHOD_NOT_ALLOWED" });
  }
  if (!session || typeof session.csrfTokenHash !== "string") {
    return Object.freeze({ allowed: false, reason: "SESSION_REQUIRED" });
  }
  if (!isTrustedMutationOrigin({ origin: req?.headers?.origin, allowedOrigins })) {
    return Object.freeze({ allowed: false, reason: "ORIGIN_NOT_ALLOWED" });
  }
  const csrfToken = req?.headers?.["x-csrf-token"];
  if (!verifyCsrfToken({ token: csrfToken, expectedTokenHash: session.csrfTokenHash })) {
    return Object.freeze({ allowed: false, reason: "CSRF_INVALID" });
  }
  return Object.freeze({ allowed: true });
}
