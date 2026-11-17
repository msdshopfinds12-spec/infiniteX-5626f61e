const AGENT_ID = /^[a-z][a-z0-9-]{1,47}$/;
const STATUSES = new Set(["disabled", "ready"]);

export class AgentRegistryError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "AgentRegistryError";
    this.code = code;
  }
}

function normalizeAgent(agent) {
  if (!agent || typeof agent !== "object" || Array.isArray(agent)) {
    throw new AgentRegistryError("INVALID_AGENT", "Agent definition must be an object.");
  }
  if (typeof agent.id !== "string" || !AGENT_ID.test(agent.id)) {
    throw new AgentRegistryError("INVALID_AGENT_ID", "Agent id must be a lowercase slug.");
  }
  if (typeof agent.name !== "string" || agent.name.trim().length < 1 || agent.name.length > 80) {
    throw new AgentRegistryError("INVALID_AGENT_NAME", "Agent name must contain 1 to 80 characters.");
  }
  if (!STATUSES.has(agent.status)) {
    throw new AgentRegistryError("INVALID_AGENT_STATUS", "Agent status must be disabled or ready.");
  }
  if (typeof agent.providerId !== "string" || agent.providerId.trim() === "") {
    throw new AgentRegistryError("INVALID_PROVIDER_ID", "Agent providerId is required.");
  }
  if (!Array.isArray(agent.capabilities) ||
      agent.capabilities.some((item) => typeof item !== "string" || item.length > 64)) {
    throw new AgentRegistryError("INVALID_CAPABILITIES", "Agent capabilities must be short strings.");
  }
  if (agent.systemPrompt !== undefined &&
      (typeof agent.systemPrompt !== "string" || agent.systemPrompt.length > 4_000)) {
    throw new AgentRegistryError("INVALID_SYSTEM_PROMPT", "System prompt must be a string up to 4000 characters.");
  }

  return Object.freeze({
    id: agent.id,
    name: agent.name.trim(),
    status: agent.status,
    providerId: agent.providerId,
    capabilities: Object.freeze([...new Set(agent.capabilities)]),
    systemPrompt: agent.systemPrompt || "",
  });
}

export function createAgentRegistry(initialAgents = []) {
  if (!Array.isArray(initialAgents)) {
    throw new TypeError("Initial agents must be an array.");
  }
  const agents = new Map();

  function register(agent) {
    const normalized = normalizeAgent(agent);
    if (agents.has(normalized.id)) {
      throw new AgentRegistryError("DUPLICATE_AGENT", "An agent with this id is already registered.");
    }
    agents.set(normalized.id, normalized);
    return normalized;
  }

  for (const agent of initialAgents) register(agent);

  function get(id) {
    return agents.get(id) || null;
  }

  function list() {
    return Object.freeze([...agents.values()]);
  }

  return Object.freeze({ register, get, list });
}
