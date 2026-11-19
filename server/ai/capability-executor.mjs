/**
 * Server-side bridge from registered agents to the deterministic local runtime.
 *
 * This is not an HTTP endpoint or authentication system. Instantiate only inside
 * a trusted server process after authenticating the caller and deriving the
 * principal. It executes only capabilities declared by the agent, present in
 * the local runtime, and explicitly allowlisted by policy.
 */
export class CapabilityExecutionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CapabilityExecutionError";
    this.code = code;
  }
}

export function createLocalCapabilityExecutor({
  registry,
  runtime,
  policy,
  maxAuditEvents = 250,
  now = () => Date.now(),
} = {}) {
  if (!registry || typeof registry.get !== "function") {
    throw new TypeError("A valid agent registry is required.");
  }
  if (!runtime || typeof runtime.run !== "function" ||
      typeof runtime.listCapabilities !== "function") {
    throw new TypeError("A valid local adapter runtime is required.");
  }
  if (!policy || typeof policy.evaluateToolRequest !== "function") {
    throw new TypeError("A valid execution policy is required.");
  }
  if (!Number.isSafeInteger(maxAuditEvents) || maxAuditEvents < 1 || maxAuditEvents > 5_000) {
    throw new TypeError("maxAuditEvents must be between 1 and 5000.");
  }
  if (typeof now !== "function") throw new TypeError("now must be a function.");

  const auditEvents = [];
  const runtimeCapabilities = new Map(
    runtime.listCapabilities().map((item) => [item.id, item]),
  );

  function record(event) {
    const at = now();
    if (!Number.isFinite(at)) {
      throw new CapabilityExecutionError("INVALID_CLOCK", "The audit clock must return a finite number.");
    }
    auditEvents.push(Object.freeze({ ...event, at }));
    if (auditEvents.length > maxAuditEvents) auditEvents.shift();
  }

  function run({ agentId, capabilityId, input, signal } = {}) {
    if (typeof agentId !== "string" || typeof capabilityId !== "string") {
      throw new CapabilityExecutionError("INVALID_REQUEST", "Agent and capability identifiers are required.");
    }

    const agent = registry.get(agentId);
    if (!agent) throw new CapabilityExecutionError("AGENT_NOT_FOUND", "The requested agent is not registered.");
    if (agent.status !== "ready") {
      throw new CapabilityExecutionError("AGENT_DISABLED", "The requested agent is not enabled.");
    }
    if (!agent.capabilities.includes(capabilityId)) {
      throw new CapabilityExecutionError("CAPABILITY_NOT_DECLARED", "The agent does not declare this capability.");
    }

    const capability = runtimeCapabilities.get(capabilityId);
    if (!capability || capability.enabled !== true) {
      throw new CapabilityExecutionError("CAPABILITY_UNAVAILABLE", "The local capability is not enabled.");
    }
    if (signal !== undefined && (!signal || typeof signal.aborted !== "boolean")) {
      throw new CapabilityExecutionError("INVALID_SIGNAL", "signal must be an AbortSignal.");
    }
    if (signal?.aborted) {
      record({ agentId, capabilityId, event: "capability_rejected", code: "ABORTED" });
      throw new CapabilityExecutionError("ABORTED", "The local operation was cancelled.");
    }

    const decision = policy.evaluateToolRequest({
      toolId: capabilityId,
      risk: "compute",
    });
    if (!decision.allowed) {
      record({ agentId, capabilityId, event: "capability_denied", code: decision.code });
      throw new CapabilityExecutionError(decision.code, "Execution policy denied this local capability.");
    }

    try {
      const result = runtime.run({ capability: capabilityId, input, signal });
      record({ agentId, capabilityId, event: "capability_completed" });
      return Object.freeze({
        agentId,
        capabilityId,
        status: "completed",
        result,
      });
    } catch (error) {
      const code = typeof error?.code === "string" ? error.code : "CAPABILITY_FAILED";
      record({ agentId, capabilityId, event: "capability_failed", code });
      throw new CapabilityExecutionError(code, "The local capability could not be completed.");
    }
  }

  function getAuditEvents() {
    return Object.freeze([...auditEvents]);
  }

  return Object.freeze({ run, getAuditEvents });
}
