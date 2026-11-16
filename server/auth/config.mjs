const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function parseUrl(value, name, errors, { allowInsecureLocalhost, allowQuery = false } = {}) {
  if (typeof value !== "string" || value.trim() === "") {
    errors.push(`${name} is required`);
    return null;
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    errors.push(`${name} must be an absolute URL`);
    return null;
  }

  if (url.username || url.password || url.hash) {
    errors.push(`${name} must not contain credentials or a fragment`);
  }
  if (!allowQuery && url.search) {
    errors.push(`${name} must not contain a query string`);
  }

  const localHttp = allowInsecureLocalhost && LOOPBACK_HOSTS.has(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && localHttp)) {
    errors.push(`${name} must use HTTPS`);
  }
  return url;
}

/**
 * Parse server-only authentication configuration.
 * This module never reads files, logs values, or mutates process.env.
 */
export function loadAuthConfig(env = process.env, options = {}) {
  const errors = [];
  const allowInsecureLocalhost = options.allowInsecureLocalhost === true;
  const issuer = parseUrl(env.AUTH_ISSUER_URL, "AUTH_ISSUER_URL", errors, {
    allowInsecureLocalhost,
  });
  const redirectUri = parseUrl(env.AUTH_REDIRECT_URI, "AUTH_REDIRECT_URI", errors, {
    allowInsecureLocalhost,
  });

  const clientId = typeof env.AUTH_CLIENT_ID === "string"
    ? env.AUTH_CLIENT_ID.trim()
    : "";
  if (!clientId) errors.push("AUTH_CLIENT_ID is required");

  const allowedOrigins = typeof env.AUTH_ALLOWED_ORIGINS === "string"
    ? env.AUTH_ALLOWED_ORIGINS.split(",").map((value) => value.trim()).filter(Boolean)
    : [];

  if (allowedOrigins.length === 0) {
    errors.push("AUTH_ALLOWED_ORIGINS must contain at least one trusted origin");
  }

  const normalizedOrigins = [];
  for (const value of allowedOrigins) {
    const originUrl = parseUrl(value, "AUTH_ALLOWED_ORIGINS entry", errors, {
      allowInsecureLocalhost,
    });
    if (!originUrl) continue;
    if (originUrl.origin !== value.replace(/\/$/, "")) {
      errors.push("AUTH_ALLOWED_ORIGINS entries must be origins without paths");
      continue;
    }
    normalizedOrigins.push(originUrl.origin);
  }

  if (redirectUri && !normalizedOrigins.includes(redirectUri.origin)) {
    errors.push("AUTH_REDIRECT_URI origin must be included in AUTH_ALLOWED_ORIGINS");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    config: Object.freeze({
      issuerUrl: issuer.href.replace(/\/$/, ""),
      clientId,
      redirectUri: redirectUri.href,
      allowedOrigins: Object.freeze([...new Set(normalizedOrigins)]),
    }),
  };
}
