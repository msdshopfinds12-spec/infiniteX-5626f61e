import { randomUUID } from "node:crypto";
import { createServer } from "node:http";

const SECURITY_HEADERS = Object.freeze({
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
});

function sendJson(response, statusCode, body, requestId, headOnly = false) {
  response.writeHead(statusCode, {
    ...SECURITY_HEADERS,
    "content-length": Buffer.byteLength(JSON.stringify(body)),
    "x-request-id": requestId,
  });
  response.end(headOnly ? undefined : JSON.stringify(body));
}

/**
 * Create a dependency-injected HTTP server.
 * This is an API foundation, not an OIDC implementation.
 * No CORS policy is enabled; browser access must be explicitly designed later.
 */
export function createInfiniteXServer({
  readinessCheck = async () => false,
  readinessTimeoutMs = 2_000,
  logger = () => {},
} = {}) {
  if (typeof readinessCheck !== "function") {
    throw new TypeError("readinessCheck must be a function");
  }
  if (!Number.isSafeInteger(readinessTimeoutMs) || readinessTimeoutMs < 1 || readinessTimeoutMs > 30_000) {
    throw new RangeError("readinessTimeoutMs must be an integer between 1 and 30000");
  }
  if (typeof logger !== "function") {
    throw new TypeError("logger must be a function");
  }

  const server = createServer(async (request, response) => {
    const requestId = randomUUID();
    const startedAt = process.hrtime.bigint();
    let route = "unmatched";
    let statusCode = 500;

    const finish = () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      try {
        logger({
          requestId,
          method: request.method,
          route,
          statusCode,
          durationMs: Math.round(durationMs * 100) / 100,
        });
      } catch {
        // Logging must never change the HTTP response or crash the server.
      }
    };

    response.once("finish", finish);

    try {
      const url = new URL(request.url ?? "/", "http://localhost");
      route = url.pathname;

      if (request.method !== "GET" && request.method !== "HEAD") {
        statusCode = 405;
        response.setHeader("allow", "GET, HEAD");
        sendJson(response, statusCode, { error: "method_not_allowed" }, requestId, request.method === "HEAD");
        return;
      }

      if (route === "/health") {
        statusCode = 200;
        sendJson(response, statusCode, { status: "ok" }, requestId, request.method === "HEAD");
        return;
      }

      if (route === "/ready") {
        let ready = false;
        let timeout;
        try {
          ready = await Promise.race([
            Promise.resolve().then(() => readinessCheck()),
            new Promise((resolve) => {
              timeout = setTimeout(() => resolve(false), readinessTimeoutMs);
              timeout.unref?.();
            }),
          ]).then((result) => result === true);
        } catch {
          ready = false;
        } finally {
          clearTimeout(timeout);
        }
        statusCode = ready ? 200 : 503;
        sendJson(
          response,
          statusCode,
          ready ? { status: "ready" } : { status: "not_ready" },
          requestId,
          request.method === "HEAD",
        );
        return;
      }

      statusCode = 404;
      sendJson(response, statusCode, { error: "not_found" }, requestId, request.method === "HEAD");
    } catch {
      if (!response.headersSent) {
        statusCode = 500;
        sendJson(response, statusCode, { error: "internal_error" }, requestId, request.method === "HEAD");
      } else {
        response.destroy();
      }
    }
  });

  server.requestTimeout = 10_000;
  server.headersTimeout = 5_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 50;

  return server;
}
