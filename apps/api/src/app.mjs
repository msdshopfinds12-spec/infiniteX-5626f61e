import { randomUUID } from "node:crypto";

const SECURITY_HEADERS = Object.freeze({
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
});

function sendJson(res, statusCode, payload, requestId) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    ...SECURITY_HEADERS,
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "X-Request-Id": requestId
  });
  res.end(body);
}

function isAllowedOrigin(origin, allowedOrigins) {
  return typeof origin === "string" && allowedOrigins.includes(origin);
}

export function createApp({ config, logger = { info() {}, error() {} } }) {
  if (!config || !Array.isArray(config.allowedOrigins)) {
    throw new TypeError("A validated runtime config is required");
  }

  return async function app(req, res) {
    const requestId = randomUUID();
    const startedAt = Date.now();
    const origin = req.headers.origin;

    try {
      if (origin && isAllowedOrigin(origin, config.allowedOrigins)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
      } else if (origin) {
        sendJson(res, 403, { error: { code: "ORIGIN_NOT_ALLOWED", requestId } }, requestId);
        return;
      }

      res.setHeader("X-Request-Id", requestId);
      for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
        res.setHeader(name, value);
      }

      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          ...SECURITY_HEADERS,
          "Access-Control-Allow-Origin": origin && isAllowedOrigin(origin, config.allowedOrigins) ? origin : "",
          "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, X-Request-Id",
          "Access-Control-Max-Age": "600",
          Vary: "Origin",
          "X-Request-Id": requestId
        });
        res.end();
        return;
      }

      if (!["GET", "HEAD"].includes(req.method ?? "")) {
        sendJson(res, 405, { error: { code: "METHOD_NOT_ALLOWED", requestId } }, requestId);
        return;
      }

      const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
      if (pathname === "/healthz") {
        sendJson(res, 200, { status: "ok", service: "infinite-x-api", requestId }, requestId);
      } else if (pathname === "/readyz") {
        // Readiness is intentionally conservative until real dependencies are wired.
        sendJson(res, 503, {
          status: "not_ready",
          checks: { authentication: "disabled", database: "disabled", aiProviders: "disabled" },
          requestId
        }, requestId);
      } else if (pathname === "/api/v1/status") {
        sendJson(res, 200, {
          service: "infinite-x-api",
          mode: "foundation",
          capabilities: {
            authentication: "not_configured",
            workspaceAuthorization: "not_configured",
            database: "not_connected",
            aiExecution: "disabled"
          },
          requestId
        }, requestId);
      } else {
        sendJson(res, 404, { error: { code: "NOT_FOUND", requestId } }, requestId);
      }
    } catch (error) {
      logger.error({ requestId, errorName: error?.name ?? "Error" });
      if (!res.headersSent) {
        sendJson(res, 500, { error: { code: "INTERNAL_ERROR", requestId } }, requestId);
      } else {
        res.destroy();
      }
    } finally {
      logger.info({ requestId, method: req.method, durationMs: Date.now() - startedAt });
    }
  };
}
