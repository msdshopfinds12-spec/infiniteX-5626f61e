/**
 * Validate OIDC discovery metadata against trusted, static application config.
 *
 * This module deliberately does not fetch URLs or verify JWTs. Fetching must be
 * performed by a maintained OIDC client with timeout, size, redirect and SSRF
 * controls. Token verification must remain inside that maintained library.
 */

const REQUIRED_ENDPOINTS = [
  "authorization_endpoint",
  "token_endpoint",
  "jwks_uri",
];

function isLoopback(hostname) {
  return hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname === "::1";
}

function parseTrustedUrl(value, label, errors, {
  allowInsecureLocalhost,
  allowedOrigins,
}) {
  if (typeof value !== "string" || value.length === 0) {
    errors.push(`${label} must be a non-empty URL`);
    return null;
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    errors.push(`${label} must be an absolute URL`);
    return null;
  }

  const localHttpAllowed = allowInsecureLocalhost && isLoopback(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && localHttpAllowed)) {
    errors.push(`${label} must use HTTPS (HTTP is allowed only for explicit loopback POC)`);
  }
  if (url.username || url.password || url.hash) {
    errors.push(`${label} must not contain credentials or a fragment`);
  }
  if (allowedOrigins && !allowedOrigins.has(url.origin)) {
    errors.push(`${label} origin is not in the configured origin allowlist`);
  }
  return url;
}

/**
 * @param {unknown} metadata Untrusted JSON returned by the configured issuer.
 * @param {string} expectedIssuer Exact issuer configured by the application.
 * @param {{allowInsecureLocalhost?: boolean, allowedOrigins?: string[]}} options
 * @returns {{ok: boolean, errors: string[]}}
 */
export function validateOidcDiscovery(metadata, expectedIssuer, options = {}) {
  const errors = [];
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return { ok: false, errors: ["discovery metadata must be a JSON object"] };
  }

  const issuerUrl = parseTrustedUrl(expectedIssuer, "configured issuer", errors, {
    allowInsecureLocalhost: options.allowInsecureLocalhost === true,
  });
  if (typeof metadata.issuer !== "string" || metadata.issuer !== expectedIssuer) {
    errors.push("metadata issuer must exactly match the configured issuer");
  }

  const configuredOrigins = new Set([
    ...(issuerUrl ? [issuerUrl.origin] : []),
    ...(Array.isArray(options.allowedOrigins) ? options.allowedOrigins : []),
  ]);

  for (const endpoint of REQUIRED_ENDPOINTS) {
    const parsed = parseTrustedUrl(metadata[endpoint], endpoint, errors, {
      allowInsecureLocalhost: options.allowInsecureLocalhost === true,
      allowedOrigins: configuredOrigins,
    });
    if (parsed && parsed.origin !== issuerUrl?.origin &&
        !configuredOrigins.has(parsed.origin)) {
      errors.push(`${endpoint} must use an explicitly trusted origin`);
    }
  }

  const algorithms = metadata.id_token_signing_alg_values_supported;
  if (!Array.isArray(algorithms) ||
      !algorithms.some((alg) => alg === "RS256" || alg === "ES256")) {
    errors.push("metadata must advertise an explicitly supported asymmetric ID-token algorithm (RS256 or ES256)");
  }
  if (Array.isArray(algorithms) && algorithms.includes("none")) {
    errors.push("the none signing algorithm is forbidden");
  }

  const pkceMethods = metadata.code_challenge_methods_supported;
  if (!Array.isArray(pkceMethods) || !pkceMethods.includes("S256")) {
    errors.push("metadata must advertise PKCE S256 support");
  }

  const responseTypes = metadata.response_types_supported;
  if (!Array.isArray(responseTypes) || !responseTypes.includes("code")) {
    errors.push("metadata must advertise the authorization code response type");
  }

  const grants = metadata.grant_types_supported;
  if (grants !== undefined &&
      (!Array.isArray(grants) || !grants.includes("authorization_code"))) {
    errors.push("if grant_types_supported is present, it must include authorization_code");
  }

  return { ok: errors.length === 0, errors };
}
