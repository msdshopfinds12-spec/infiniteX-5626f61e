const TOOL_RISKS = new Set(["read", "compute", "write", "external", "destructive"]);

export class PolicyError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "PolicyError";
    this.code = code;
  }
}

function boundedInteger(value, fallback, name, maximum) {
  const candidate = value ?? fallback;
  if (!Number.isSafeInteger(candidate) || candidate < 1 || candidate > maximum) {
    throw new TypeError(name + " must be an integer between 1 and " + maximum + ".");
  }
  return candidate;
}

/**
 * Creates a deny-by-default policy. This module is a policy primitive, not an
 * authorization boundary by itself: production approval verification and all
 * provider/tool execution must happen on a trusted server.
 */
export function createExecutionPolicy({
  allowedProviders = [],
  allowedTools = [],
  maxInputChars = 8_000,
  maxOutputChars = 12_000,
  maxRunSteps = 4,
  maxEstimatedCostUsd = 0,
  verifyApproval = () => false,
} = {}) {
  if (!Array.isArray(allowedProviders) || !Array.isArray(allowedTools)) {
    throw new TypeError("Provider and tool allowlists must be arrays.");
  }
  if (typeof verifyApproval !== "function") {
    throw new TypeError("verifyApproval must be a function.");
  }
  if (!Number.isFinite(maxEstimatedCostUsd) || maxEstimatedCostUsd < 0) {
    throw new TypeError("maxEstimatedCostUsd must be a finite non-negative number.");
  }

  const providerAllowlist = new Set(allowedProviders);
  const toolAllowlist = new Map();
  for (const tool of allowedTools) {
    if (!tool || typeof tool.id !== "string" || !TOOL_RISKS.has(tool.risk)) {
      throw new TypeError("Each allowed tool needs an id and a supported risk.");
    }
    toolAllowlist.set(tool.id, tool.risk);
  }

  const limits = Object.freeze({
    maxInputChars: boundedInteger(maxInputChars, 8_000, "maxInputChars", 100_000),
    maxOutputChars: boundedInteger(maxOutputChars, 12_000, "maxOutputChars", 100_000),
    maxRunSteps: boundedInteger(maxRunSteps, 4, "maxRunSteps", 32),
    maxEstimatedCostUsd,
  });

  function evaluateModelRequest({ providerId, input, estimatedCostUsd = Infinity, steps = 1 } = {}) {
    if (typeof providerId !== "string" || !providerAllowlist.has(providerId)) {
      return Object.freeze({ allowed: false, code: "PROVIDER_NOT_ALLOWED" });
    }
    if (typeof input !== "string" || input.trim().length === 0) {
      return Object.freeze({ allowed: false, code: "INVALID_INPUT" });
    }
    if (input.length > limits.maxInputChars) {
      return Object.freeze({ allowed: false, code: "INPUT_LIMIT_EXCEEDED" });
    }
    if (!Number.isSafeInteger(steps) || steps < 1 || steps > limits.maxRunSteps) {
      return Object.freeze({ allowed: false, code: "STEP_LIMIT_EXCEEDED" });
    }
    if (!Number.isFinite(estimatedCostUsd) || estimatedCostUsd < 0 ||
        estimatedCostUsd > limits.maxEstimatedCostUsd) {
      return Object.freeze({ allowed: false, code: "BUDGET_LIMIT_EXCEEDED" });
    }
    return Object.freeze({ allowed: true, code: "ALLOWED" });
  }

  function evaluateToolRequest({ toolId, risk, approval } = {}) {
    if (typeof toolId !== "string" || !TOOL_RISKS.has(risk)) {
      return Object.freeze({ allowed: false, code: "INVALID_TOOL_REQUEST" });
    }
    if (!toolAllowlist.has(toolId) || toolAllowlist.get(toolId) !== risk) {
      return Object.freeze({ allowed: false, code: "TOOL_NOT_ALLOWLISTED" });
    }
    if (risk === "destructive") {
      return Object.freeze({ allowed: false, code: "DESTRUCTIVE_TOOL_BLOCKED" });
    }
    if (risk === "read" || risk === "compute") {
      return Object.freeze({ allowed: true, code: "ALLOWED" });
    }
    let verified = false;
    try {
      verified = verifyApproval(approval, Object.freeze({ toolId, risk })) === true;
    } catch {
      verified = false;
    }
    return verified
      ? Object.freeze({ allowed: true, code: "APPROVED" })
      : Object.freeze({ allowed: false, code: "APPROVAL_REQUIRED" });
  }

  return Object.freeze({ limits, evaluateModelRequest, evaluateToolRequest });
}
