import { randomUUID } from "node:crypto";

const JSON_HEADERS = Object.freeze({
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
});

function sendJson(response, statusCode, payload, requestId) {
  response.writeHead(statusCode, {
    ...JSON_HEADERS,
    "content-length": Buffer.byteLength(JSON.stringify(payload)),
    "x-request-id": requestId,
  });
  response.end(JSON.stringify(payload));
}

export function createAppHandler({ readinessCheck = async () => true } = {}) {
  return async function appHandler(request, response) {
    const requestId = randomUUID();

    try {
      if (request.method !== "GET" && request.method !== "HEAD") {
        sendJson(response, 405, {
          error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed." },
          requestId,
        }, requestId);
        return;
      }

      const url = new URL(request.url ?? "/", "http://localhost");

      if (url.pathname === "/healthz") {
        sendJson(response, 200, {
          status: "ok",
          service: "infinite-x-api",
          requestId,
        }, requestId);
        return;
      }

      if (url.pathname === "/readyz") {
        const ready = await readinessCheck();
        sendJson(response, ready ? 200 : 503, {
          status: ready ? "ready" : "not_ready",
          service: "infinite-x-api",
          requestId,
        }, requestId);
        return;
      }

      sendJson(response, 404, {
        error: { code: "NOT_FOUND", message: "Route not found." },
        requestId,
      }, requestId);
    } catch {
      if (!response.headersSent) {
        sendJson(response, 500, {
          error: { code: "INTERNAL_ERROR", message: "An internal error occurred." },
          requestId,
        }, requestId);
      } else {
        response.destroy();
      }
    }
  };
}
