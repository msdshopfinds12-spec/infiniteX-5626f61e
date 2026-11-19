/**
 * Deterministic local adapter runtime.
 *
 * Security contract:
 * - Only the two built-in pure functions below can run.
 * - No dynamic imports, eval, shell, filesystem, network, provider, or plugin code.
 * - Inputs/outputs are JSON data with strict size and shape limits.
 * - This is a trusted server-side module, not a sandbox for untrusted code.
 */
export class LocalAdapterError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "LocalAdapterError";
    this.code = code;
  }
}

const CAPABILITIES = Object.freeze({
  "text.metrics": Object.freeze({ risk: "compute:local", description: "Count characters, words, and lines." }),
  "task.preview": Object.freeze({ risk: "compute:local", description: "Validate and preview a task title without scheduling it." }),
});

function isPlainRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertJsonData(value, depth = 0) {
  if (depth > 8) throw new LocalAdapterError("INPUT_TOO_DEEP", "Input nesting exceeds the supported depth.");
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new LocalAdapterError("INVALID_INPUT", "Input numbers must be finite.");
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > 100) throw new LocalAdapterError("INPUT_TOO_LARGE", "Input arrays exceed the item limit.");
    for (const item of value) assertJsonData(item, depth + 1);
    return;
  }
  if (!isPlainRecord(value)) throw new LocalAdapterError("INVALID_INPUT", "Input must contain plain JSON data only.");
  for (const [key, item] of Object.entries(value)) {
    if (["__proto__", "prototype", "constructor"].includes(key)) {
      throw new LocalAdapterError("UNSAFE_KEY", "Prototype-related keys are not accepted.");
    }
    assertJsonData(item, depth + 1);
  }
}

function encodeSize(value) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function executeBuiltIn(capability, input) {
  if (capability === "text.metrics") {
    if (typeof input.text !== "string" || input.text.length > 8_000) {
      throw new LocalAdapterError("INVALID_ARGUMENT", "text must be a string of at most 8000 characters.");
    }
    const text = input.text;
    const trimmed = text.trim();
    return Object.freeze({
      characters: text.length,
      words: trimmed ? trimmed.split(/\\s+/u).length : 0,
      lines: text.length ? text.split(/\\r\\n|\\r|\\n/u).length : 0,
    });
  }
  if (capability === "task.preview") {
    if (typeof input.title !== "string" || input.title.trim().length < 1 || input.title.trim().length > 160) {
      throw new LocalAdapterError("INVALID_ARGUMENT", "title must contain 1–160 characters.");
    }
    return Object.freeze({
      title: input.title.trim(),
      accepted: true,
      execution: "not_started",
      note: "Preview only. No task was queued or executed.",
    });
  }
  throw new LocalAdapterError("CAPABILITY_NOT_ALLOWED", "The requested local capability is not allowlisted.");
}

export function createLocalAdapterRuntime({
  maxInputBytes = 16_384,
  maxOutputBytes = 32_768,
  maxConcurrentRuns = 2,
  now = () => Date.now(),
} = {}) {
  for (const [name, value, max] of [
    ["maxInputBytes", maxInputBytes, 65_536],
    ["maxOutputBytes", maxOutputBytes, 65_536],
    ["maxConcurrentRuns", maxConcurrentRuns, 8],
  ]) {
    if (!Number.isSafeInteger(value) || value < 1 || value > max) {
      throw new TypeError(name + " must be a positive bounded integer.");
    }
  }
  if (typeof now !== "function") throw new TypeError("now must be a function.");
  let activeRuns = 0;

  function listCapabilities() {
    return Object.freeze(Object.entries(CAPABILITIES).map(([id, value]) =>
      Object.freeze({ id, ...value, enabled: true })
    ));
  }

  function run({ capability, input, signal } = {}) {
    if (typeof capability !== "string" || !Object.hasOwn(CAPABILITIES, capability)) {
      throw new LocalAdapterError("CAPABILITY_NOT_ALLOWED", "The requested local capability is not allowlisted.");
    }
    if (!isPlainRecord(input)) {
      throw new LocalAdapterError("INVALID_INPUT", "Capability input must be a plain JSON object.");
    }
    assertJsonData(input);
    if (encodeSize(input) > maxInputBytes) {
      throw new LocalAdapterError("INPUT_TOO_LARGE", "Capability input exceeds the configured byte limit.");
    }
    if (signal && typeof signal.aborted !== "boolean") {
      throw new LocalAdapterError("INVALID_SIGNAL", "signal must be an AbortSignal.");
    }
    if (signal?.aborted) throw new LocalAdapterError("ABORTED", "The local operation was cancelled.");
    if (activeRuns >= maxConcurrentRuns) {
      throw new LocalAdapterError("CAPACITY_LIMIT", "The local adapter concurrency limit has been reached.");
    }

    activeRuns += 1;
    const startedAt = now();
    try {
      const output = executeBuiltIn(capability, input);
      if (signal?.aborted) throw new LocalAdapterError("ABORTED", "The local operation was cancelled.");
      if (encodeSize(output) > maxOutputBytes) {
        throw new LocalAdapterError("OUTPUT_TOO_LARGE", "Capability output exceeds the configured byte limit.");
      }
      return Object.freeze({
        capability,
        status: "completed",
        output,
        startedAt,
        finishedAt: now(),
        sideEffects: "none",
      });
    } finally {
      activeRuns -= 1;
    }
  }

  return Object.freeze({ listCapabilities, run, get activeRuns() { return activeRuns; } });
}
