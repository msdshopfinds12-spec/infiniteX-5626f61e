/**
 * Bounded retry primitives for trusted server-side action adapters.
 * Side-effecting operations require provider-enforced idempotency.
 */
const RETRYABLE_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const RETRYABLE_ERROR_CODES = new Set([
  "ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "ECONNREFUSED",
  "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_SOCKET",
]);

export function validateRetryPolicy(policy = {}) {
  const maxAttempts = policy.maxAttempts ?? 3;
  const baseDelayMs = policy.baseDelayMs ?? 250;
  const maxDelayMs = policy.maxDelayMs ?? 5000;
  const maxElapsedMs = policy.maxElapsedMs ?? 15000;
  for (const [name, value, min, max] of [
    ["maxAttempts", maxAttempts, 1, 10],
    ["baseDelayMs", baseDelayMs, 0, 30000],
    ["maxDelayMs", maxDelayMs, 0, 30000],
    ["maxElapsedMs", maxElapsedMs, 1, 60000],
  ]) {
    if (!Number.isSafeInteger(value) || value < min || value > max) {
      throw new TypeError("invalid_retry_policy:" + name);
    }
  }
  if (maxDelayMs < baseDelayMs) throw new TypeError("invalid_retry_policy:maxDelayMs");
  return Object.freeze({ maxAttempts, baseDelayMs, maxDelayMs, maxElapsedMs });
}

export function classifyRetryError(error) {
  if (!error || typeof error !== "object") return "permanent";
  if (error.retryable === false || error.name === "AbortError") return "permanent";
  const status = Number(error.status ?? error.statusCode ?? error.response?.status);
  if (Number.isInteger(status) && RETRYABLE_HTTP_STATUSES.has(status)) return "retryable";
  if (typeof error.code === "string" && RETRYABLE_ERROR_CODES.has(error.code)) return "retryable";
  return "permanent";
}

export function computeRetryDelayMs(attempt, policy = {}, random = Math.random, retryAfterMs) {
  const safe = validateRetryPolicy(policy);
  if (!Number.isSafeInteger(attempt) || attempt < 1 || attempt >= safe.maxAttempts) {
    throw new RangeError("retry_attempt_out_of_range");
  }
  if (typeof random !== "function") throw new TypeError("random_must_be_function");
  const sample = random();
  if (!Number.isFinite(sample) || sample < 0 || sample >= 1) {
    throw new TypeError("random_value_out_of_range");
  }
  const exponent = Math.min(attempt - 1, 30);
  const ceiling = Math.min(safe.maxDelayMs, safe.baseDelayMs * (2 ** exponent));
  const jittered = Math.floor(sample * (ceiling + 1));
  if (retryAfterMs === undefined || retryAfterMs === null) return jittered;
  if (!Number.isFinite(retryAfterMs) || retryAfterMs < 0) throw new TypeError("invalid_retry_after_ms");
  if (retryAfterMs > safe.maxDelayMs) throw new RangeError("retry_after_exceeds_delay_cap");
  return Math.max(jittered, Math.ceil(retryAfterMs));
}

export function getRetryAfterMs(error, wallClockNow = Date.now) {
  const explicit = error && typeof error === "object" ? error.retryAfterMs : undefined;
  if (explicit !== undefined) return Number.isFinite(explicit) && explicit >= 0 ? explicit : undefined;
  const raw = error?.response?.headers?.get?.("retry-after") ?? error?.headers?.get?.("retry-after");
  if (typeof raw !== "string" || raw.trim() === "") return undefined;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(raw);
  return Number.isFinite(date) ? Math.max(0, date - wallClockNow()) : undefined;
}

export function assertIdempotencyKey(value) {
  if (typeof value !== "string" || value.length < 8 || value.length > 200 ||
      !/^[A-Za-z0-9._:-]+$/.test(value)) throw new TypeError("valid_idempotency_key_required");
  return value;
}

export async function buildIdempotencyKey({ runId, stepId, actionVersion = "v1" }) {
  for (const [name, value] of [["runId", runId], ["stepId", stepId], ["actionVersion", actionVersion]]) {
    if (typeof value !== "string" || value.trim() === "" || value.length > 200) {
      throw new TypeError("invalid_idempotency_identity:" + name);
    }
  }
  if (!globalThis.crypto?.subtle) throw new Error("web_crypto_unavailable");
  const material = new TextEncoder().encode([runId, stepId, actionVersion].join("\u001f"));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", material);
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return "ix1_" + hex;
}

export function waitForRetry(delayMs, signal) {
  if (!Number.isSafeInteger(delayMs) || delayMs < 0) return Promise.reject(new TypeError("invalid_retry_delay"));
  if (signal?.aborted) return Promise.reject(signal.reason ?? new Error("retry_aborted"));
  if (delayMs === 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cleanup = () => signal?.removeEventListener("abort", onAbort);
    const timer = setTimeout(() => { cleanup(); resolve(); }, delayMs);
    const onAbort = () => {
      clearTimeout(timer);
      cleanup();
      reject(signal.reason ?? new Error("retry_aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function runWithRetry(operation, options = {}) {
  if (typeof operation !== "function") throw new TypeError("operation_must_be_function");
  const policy = validateRetryPolicy(options.policy);
  const sideEffecting = options.sideEffecting === true;
  const idempotencyKey = sideEffecting ? assertIdempotencyKey(options.idempotencyKey) : options.idempotencyKey;
  const random = options.random ?? Math.random;
  const wait = options.wait ?? waitForRetry;
  const now = options.monotonicNow ?? (() => performance.now());
  if (typeof wait !== "function" || typeof now !== "function") throw new TypeError("retry_dependencies_must_be_functions");
  const startedAt = now();
  if (!Number.isFinite(startedAt)) throw new TypeError("invalid_monotonic_clock");
  const signal = options.signal;
  let lastError;
  for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
    if (signal?.aborted) throw signal.reason ?? new Error("retry_aborted");
    const current = now();
    if (!Number.isFinite(current) || current - startedAt > policy.maxElapsedMs) {
      throw lastError ?? new Error("retry_elapsed_budget_exceeded");
    }
    try {
      const result = await operation({ attempt, idempotencyKey, signal });
      const completedAt = now();
      if (!Number.isFinite(completedAt) || completedAt - startedAt > policy.maxElapsedMs) {
        throw new Error("retry_elapsed_budget_exceeded");
      }
      return result;
    } catch (error) {
      lastError = error;
      if (attempt >= policy.maxAttempts || classifyRetryError(error) !== "retryable") throw error;
      const elapsed = now() - startedAt;
      const remaining = policy.maxElapsedMs - elapsed;
      if (!Number.isFinite(remaining) || remaining <= 0) throw error;
      let delay;
      try {
        delay = computeRetryDelayMs(attempt, policy, random, getRetryAfterMs(error));
      } catch {
        // Never retry earlier than a provider's Retry-After instruction.
        throw error;
      }
      if (delay > remaining) throw error;
      await wait(delay, signal);
    }
  }
  throw lastError ?? new Error("retry_exhausted");
}
