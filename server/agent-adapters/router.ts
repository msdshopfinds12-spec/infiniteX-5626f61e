import type {
  AgentCapability,
  AgentRegistry,
  AgentTaskResult,
} from "./contracts";

export interface RouteAgentTaskInput {
  readonly operationId: string;
  readonly agentId: string;
  readonly capability: AgentCapability;
  readonly prompt: string;
}

export type RouteAgentTaskResult =
  | { readonly ok: true; readonly result: AgentTaskResult }
  | { readonly ok: false; readonly status: 400 | 403 | 404 | 503; readonly error: string };

const OPERATION_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{2,95}$/;

export async function routeAgentTask(
  registry: AgentRegistry,
  input: RouteAgentTaskInput,
): Promise<RouteAgentTaskResult> {
  if (!OPERATION_ID_PATTERN.test(input.operationId)) {
    return { ok: false, status: 400, error: "invalid_operation_id" };
  }
  if (typeof input.prompt !== "string" || input.prompt.trim().length === 0) {
    return { ok: false, status: 400, error: "prompt_required" };
  }

  const adapter = registry.get(input.agentId);
  if (!adapter) {
    const candidate = registry.list().find((manifest) => manifest.id === input.agentId);
    return candidate
      ? { ok: false, status: 503, error: "external_agent_not_connected" }
      : { ok: false, status: 404, error: "agent_not_registered" };
  }

  const manifest = adapter.manifest;
  if (!manifest.capabilities.includes(input.capability)) {
    return { ok: false, status: 403, error: "capability_not_allowed" };
  }
  if (input.prompt.length > manifest.maxInputChars) {
    return { ok: false, status: 400, error: "prompt_too_long" };
  }
  if (manifest.runtime !== "mock" || manifest.status !== "simulated") {
    return { ok: false, status: 503, error: "external_agent_not_connected" };
  }

  try {
    const result = await adapter.execute({
      operationId: input.operationId,
      capability: input.capability,
      prompt: input.prompt.trim(),
    });
    return { ok: true, result };
  } catch {
    return { ok: false, status: 503, error: "agent_execution_failed" };
  }
}
