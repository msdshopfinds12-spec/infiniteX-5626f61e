const DEFAULT_PORT = 4100;
const LOOPBACK_HOST = "127.0.0.1";

export function loadConfig(env = process.env) {
  const rawPort = env.API_PORT ?? String(DEFAULT_PORT);
  const port = Number(rawPort);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("API_PORT must be an integer between 1 and 65535.");
  }

  const host = env.API_HOST ?? LOOPBACK_HOST;
  if (typeof host !== "string" || host.length < 1 || host.length > 255) {
    throw new Error("API_HOST must be a valid hostname or IP address.");
  }

  const nodeEnv = env.NODE_ENV ?? "development";
  if (!["development", "test", "production"].includes(nodeEnv)) {
    throw new Error("NODE_ENV must be development, test, or production.");
  }

  return Object.freeze({ host, port, nodeEnv });
}
