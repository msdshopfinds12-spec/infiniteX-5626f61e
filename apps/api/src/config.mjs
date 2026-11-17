const DEFAULT_PORT = 8787;

function parsePort(value) {
  if (value === undefined || value === "") return DEFAULT_PORT;
  if (!/^[0-9]{1,5}$/.test(value)) throw new Error("PORT must be an integer between 1 and 65535");
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }
  return port;
}

function parseOrigins(value) {
  if (!value) return [];
  const origins = value.split(",").map((item) => item.trim()).filter(Boolean);
  for (const origin of origins) {
    let parsed;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error("ALLOWED_ORIGINS must contain valid absolute origins");
    }
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.origin !== origin) {
      throw new Error("ALLOWED_ORIGINS entries must be canonical HTTP(S) origins without paths");
    }
  }
  return [...new Set(origins)];
}

export function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV ?? "development";
  if (!["development", "test", "production"].includes(nodeEnv)) {
    throw new Error("NODE_ENV must be development, test, or production");
  }

  const port = parsePort(env.PORT);
  const host = env.HOST ?? "127.0.0.1";
  if (nodeEnv === "production" && host !== "0.0.0.0" && host !== "::") {
    throw new Error("Production HOST must explicitly be 0.0.0.0 or ::");
  }

  const allowedOrigins = parseOrigins(env.ALLOWED_ORIGINS);
  if (nodeEnv === "production" && allowedOrigins.length === 0) {
    throw new Error("ALLOWED_ORIGINS is required in production");
  }

  return Object.freeze({
    nodeEnv,
    host,
    port,
    allowedOrigins,
    trustProxy: false,
    authenticationEnabled: false,
    databaseEnabled: false,
    aiProvidersEnabled: false
  });
}
