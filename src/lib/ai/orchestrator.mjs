export class OrchestrationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "OrchestrationError";
    this.code = code;
  }
}

let fallbackRunSequence = 0;
function makeId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  fallbackRunSequence += 1;
  return "run-" + Date.now().toString(36) + "-" + fallbackRunSequence.toString(36);
}

/**
 * Provider-neutral, single-step orchestration core.
 *
 * IMPORTANT: instantiate this only in a trusted server runtime. The browser
 * must never receive provider credentials or privileged tool implementations.
 * No provider is configured by default, and this module does not execute code.
 */
export function createOrchestrator({
  registry,
  policy,
  providers = {},
  timeoutMs = 15_000,
  maxAuditEvents = 500,
  idFactory = makeId,
  now = () => Date.now(),
} = {}) {
  if (!registry || typeof registry.get !== "function") {
    throw new TypeError("A valid agent registry is required.");
  }
  if (!policy || typeof policy.evaluateModelRequest !== "function") {
    throw new TypeError("A valid execution policy is required.");
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120_000) {
    throw new TypeError("timeoutMs must be between 100 and 120000.");
  }
  if (!providers || typeof providers !== "object" || Array.isArray(providers)) {
    throw new TypeError("providers must be a provider adapter map.");
  }
  if (!Number.isSafeInteger(maxAuditEvents) || maxAuditEvents < 1 || maxAuditEvents > 10_000) {
    throw new TypeError("maxAuditEvents must be between 1 and 10000.");
  }

  const auditEvents = [];

  function record(event) {
    auditEvents.push(Object.freeze({ ...event }));
    if (auditEvents.length > maxAuditEvents) auditEvents.shift();
  }

  async function run({ agentId, input, signal } = {}) {
    const runId = idFactory();
    const startedAt = now();
    const agent = registry.get(agentId);
    if (!agent) throw new OrchestrationError("AGENT_NOT_FOUND", "The requested agent is not registered.");
    if (agent.status !== "ready") {
      throw new OrchestrationError("AGENT_DISABLED", "The requested agent is not enabled.");
    }

    const provider = Object.hasOwn(providers, agent.providerId) ? providers[agent.providerId] : null;
    if (!provider || provider.enabled !== true || typeof provider.generate !== "function") {
      throw new OrchestrationError("PROVIDER_UNAVAILABLE", "No enabled provider adapter is configured.");
    }

    const decision = policy.evaluateModelRequest({
      providerId: agent.providerId,
      input,
      estimatedCostUsd: provider.estimatedCostUsd,
      steps: 1,
    });
    if (!decision.allowed) {
      throw new OrchestrationError(decision.code, "The execution policy denied this model request.");
    }

    const controller = new AbortController();
    const abortFromCaller = () => controller.abort(signal?.reason);
    if (signal?.aborted) abortFromCaller();
    else signal?.addEventListener("abort", abortFromCaller, { once: true });

    let rejectOnAbort = null;
    const abortPromise = new Promise((_resolve, reject) => {
      if (controller.signal.aborted) return;
      rejectOnAbort = () => reject(controller.signal.reason ||
        new DOMException("Execution aborted.", "AbortError"));
      controller.signal.addEventListener("abort", rejectOnAbort, { once: true });
    });
    const timeoutId = setTimeout(
      () => controller.abort(new DOMException("Execution timed out.", "TimeoutError")),
      timeoutMs,
    );

    record({ runId, agentId, providerId: agent.providerId, event: "run_started", at: startedAt });

    try {
      if (controller.signal.aborted) {
        throw new OrchestrationError("ABORTED", "The agent execution was cancelled.");
      }
      const result = await Promise.race([
        Promise.resolve().then(() => provider.generate({
          input,
          systemPrompt: agent.systemPrompt,
          signal: controller.signal,
          maxOutputChars: policy.limits.maxOutputChars,
        })),
        abortPromise,
      ]);
      if (typeof result !== "string") {
        throw new OrchestrationError("INVALID_PROVIDER_OUTPUT", "The provider returned an invalid response.");
      }
      if (result.length > policy.limits.maxOutputChars) {
        throw new OrchestrationError("OUTPUT_LIMIT_EXCEEDED", "The provider response exceeded the output limit.");
      }
      const finishedAt = now();
      record({ runId, agentId, providerId: agent.providerId, event: "run_completed", at: finishedAt });
      return Object.freeze({
        runId,
        agentId,
        providerId: agent.providerId,
        status: "completed",
        output: result,
        startedAt,
        finishedAt,
        durationMs: Math.max(0, finishedAt - startedAt),
      });
    } catch (error) {
      if (error instanceof OrchestrationError) {
        record({ runId, agentId, providerId: agent.providerId, event: "run_failed", code: error.code, at: now() });
        throw error;
      }
      if (controller.signal.aborted) {
        const timedOut = controller.signal.reason?.name === "TimeoutError";
        const code = timedOut ? "TIMEOUT" : "ABORTED";
        record({ runId, agentId, providerId: agent.providerId, event: "run_failed", code, at: now() });
        throw new OrchestrationError(
          code,
          timedOut ? "The agent execution timed out." : "The agent execution was cancelled.",
        );
      }
      record({ runId, agentId, providerId: agent.providerId, event: "run_failed", code: "PROVIDER_FAILED", at: now() });
      throw new OrchestrationError("PROVIDER_FAILED", "The configured provider request failed.");
    } finally {
      clearTimeout(timeoutId);
      if (rejectOnAbort) controller.signal.removeEventListener("abort", rejectOnAbort);
      signal?.removeEventListener("abort", abortFromCaller);
    }
  }

  function getAuditEvents() {
    return Object.freeze([...auditEvents]);
  }

  return Object.freeze({ run, getAuditEvents });
}
