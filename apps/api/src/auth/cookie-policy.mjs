const COOKIE_NAME_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const COOKIE_VALUE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function assertCookieName(name) {
  if (typeof name !== "string" || !COOKIE_NAME_PATTERN.test(name)) {
    throw new TypeError("Cookie name is invalid");
  }
  if (!name.startsWith("__Host-")) {
    throw new TypeError("Session cookies must use the __Host- prefix");
  }
}

export function serializeSessionCookie({
  name = "__Host-infinite_x_session",
  value,
  maxAgeSeconds,
  sameSite = "Lax"
}) {
  assertCookieName(name);
  if (typeof value !== "string" || !COOKIE_VALUE_PATTERN.test(value)) {
    throw new TypeError("Session cookie value is invalid");
  }
  if (!Number.isInteger(maxAgeSeconds) || maxAgeSeconds < 0 || maxAgeSeconds > 31_536_000) {
    throw new RangeError("maxAgeSeconds must be between 0 and one year");
  }
  if (!["Lax", "Strict"].includes(sameSite)) {
    throw new TypeError("SameSite must be Lax or Strict");
  }
  return [
    name + "=" + value,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=" + sameSite,
    "Max-Age=" + maxAgeSeconds
  ].join("; ");
}

export function serializeExpiredSessionCookie(name = "__Host-infinite_x_session") {
  assertCookieName(name);
  return [
    name + "=",
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Max-Age=0"
  ].join("; ");
}

export function readSessionCookie(cookieHeader, name = "__Host-infinite_x_session") {
  assertCookieName(name);
  if (typeof cookieHeader !== "string" || cookieHeader.length > 8192) return null;
  const matches = cookieHeader.split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(name + "="));
  if (matches.length !== 1) return null;
  const value = matches[0].slice(name.length + 1);
  return COOKIE_VALUE_PATTERN.test(value) ? value : null;
}
