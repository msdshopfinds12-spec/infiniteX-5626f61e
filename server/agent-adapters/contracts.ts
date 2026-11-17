export type AgentCapability =
  | "policy.evaluate"
  | "workflow.route"
  | "chat.respond"
  | "code.review"
  | "repo.propose_patch"
  | "data.analyze"
  | "content.draft"
  | "marketing.plan"
  | "personal.assist";

export type AgentConnectionStatus = "not-connected" | "simulated";
export type AgentRuntime = "mock" | "external";

export interface AgentManifest {
  readonly id: string;
  readonly name: string;
  readonly repository: string;
  readonly version: string;
  readonly status: AgentConnectionStatus;
  readonly runtime: AgentRuntime;
  readonly capabilities: readonly AgentCapability[];
  readonly maxInputChars: number;
  readonly requiresHumanApproval: true;
}

export interface AgentTask {
  readonly operationId: string;
  readonly capability: AgentCapability;
  readonly prompt: string;
}

export interface AgentTaskResult {
  readonly operationId: string;
  readonly agentId: string;
  readonly status: "simulated" | "blocked" | "failed";
  readonly summary: string;
  readonly evidence: readonly string[];
}

export interface AgentAdapter {
  readonly manifest: AgentManifest;
  execute(task: AgentTask): Promise<AgentTaskResult>;
}

export interface AgentRegistry {
  list(): readonly AgentManifest[];
  get(agentId: string): AgentAdapter | undefined;
  resolve(capability: AgentCapability): AgentAdapter | undefined;
}
