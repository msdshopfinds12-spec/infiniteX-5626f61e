/**
 * Minimal browser API boundary for InfiniteX.
 *
 * Security defaults:
 * - HTTPS outside localhost.
 * - Same-origin request paths only.
 * - Credentials are omitted unless a future, reviewed adapter opts in.
 * - Redirects are rejected to avoid silently crossing trust boundaries.
 * - No automatic retries: mutations must never be replayed implicitly.
 * - Response bodies are not copied into thrown errors or logs.
 */

/**
 * @typedef {Object} ApiClientOptions
 * @property {string} baseUrl
 * @property {typeof fetch} [fetchImpl]
 * @property {number} [timeoutMs]
 */

/**
 * @typedef {Object} ApiRequestOptions
 * @property {string} [method]
 * @property {HeadersInit} [headers]
 * @property {unknown} [body]
 * @property {AbortSignal} [signal]
 * @property {(value: unknown) => boolean} [validate]
 */

export class ApiClientError extends Error {
  /**
   * @param {string} message
   * @param {{ code: string, status?: number, cause?: unknown }} details
   */
  constructor(message, details) {
    super(message, details.cause === undefined ? undefined : { cause: details.cause });
    this.name = "ApiClientError";
    this.code = details.code;
    this.status = details.status;
  }
}

function resolveBaseUrl(value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError("A valid API baseUrl is required.");
  }

  const url = new URL(value);
  const localHost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && localHost)) {
    throw new TypeError("API baseUrl must use HTTPS (HTTP is allowed only for localhost).");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new TypeError("API baseUrl must not contain credentials, query parameters, or fragments.");
  }

  return url;
}

/**
 * @param {ApiClientOptions} options
 */
export function createApiClient({ baseUrl, fetchImpl = globalThis.fetch, timeoutMs = 10_000 } = {}) {
  const base = resolveBaseUrl(baseUrl);

  if (typeof fetchImpl !== "function") {
    throw new TypeError("A Fetch-compatible implementation is required.");
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) {
    throw new TypeError("timeoutMs must be an integer between 1 and 120000.");
  }

  /**
   * @param {string} path
   * @param {ApiRequestOptions} [options]
   */
  async function request(path, options = {}) {
    if (typeof path !== "string" || path.trim() === "") {
      throw new TypeError("A non-empty API path is required.");
    }

    const url = new URL(path, base);
    if (url.origin !== base.origin || url.username || url.password || url.hash) {
      throw new ApiClientError("The API path is outside the configured origin.", {
        code: "UNTRUSTED_URL",
      });
    }

    const method = String(options.method || "GET").toUpperCase();
    if (!/^(GET|POST|PUT|PATCH|DELETE)$/.test(method)) {
      throw new TypeError("Unsupported HTTP method.");
    }

    const headers = new Headers(options.headers || {});
    headers.set("Accept", "application/json");

    let body;
    if (options.body !== undefined) {
      if (method === "GET" || method === "DELETE") {
        throw new TypeError(`${method} requests must not include a JSON body.`);
      }
      try {
        body = JSON.stringify(options.body);
      } catch (cause) {
        throw new ApiClientError("The request body could not be serialized.", {
          code: "INVALID_REQUEST_BODY",
          cause,
        });
      }
      if (body === undefined) {
        throw new ApiClientError("The request body must be JSON serializable.", {
          code: "INVALID_REQUEST_BODY",
        });
      }
      headers.set("Content-Type", "application/json");
    }

    const controller = new AbortController();
    const abortFromCaller = () => controller.abort(options.signal?.reason);
    if (options.signal?.aborted) abortFromCaller();
    else options.signal?.addEventListener("abort", abortFromCaller, { once: true });

    const timeoutId = setTimeout(
      () => controller.abort(new DOMException("Request timed out.", "TimeoutError")),
      timeoutMs,
    );

    try {
      const response = await fetchImpl(url, {
        method,
        headers,
        body,
        signal: controller.signal,
        credentials: "omit",
        redirect: "error",
        cache: "no-store",
      });

      if (!response.ok) {
        throw new ApiClientError("The API request failed.", {
          code: "HTTP_ERROR",
          status: response.status,
        });
      }

      if (response.status === 204) return null;

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.toLowerCase().includes("application/json")) {
        throw new ApiClientError("The API returned an unsupported content type.", {
          code: "UNEXPECTED_CONTENT_TYPE",
          status: response.status,
        });
      }

      let payload;
      try {
        payload = await response.json();
      } catch (cause) {
        throw new ApiClientError("The API returned invalid JSON.", {
          code: "INVALID_JSON",
          status: response.status,
          cause,
        });
      }

      if (options.validate && options.validate(payload) !== true) {
        throw new ApiClientError("The API response did not match the expected contract.", {
          code: "INVALID_RESPONSE",
          status: response.status,
        });
      }

      return payload;
    } catch (error) {
      if (error instanceof ApiClientError) throw error;
      if (controller.signal.aborted) {
        const timedOut = controller.signal.reason?.name === "TimeoutError";
        throw new ApiClientError(
          timedOut ? "The API request timed out." : "The API request was cancelled.",
          { code: timedOut ? "TIMEOUT" : "ABORTED", cause: error },
        );
      }
      throw new ApiClientError("The API request could not be completed.", {
        code: "NETWORK_ERROR",
        cause: error,
      });
    } finally {
      clearTimeout(timeoutId);
      options.signal?.removeEventListener("abort", abortFromCaller);
    }
  }

  return Object.freeze({ request });
}
