import type {
  AgentAdapter,
  AgentCapability,
  AgentManifest,
  AgentRegistry,
  AgentTask,
  AgentTaskResult,
} from "./contracts";

const candidateManifests: readonly AgentManifest[] = Object.freeze([
  {
    id: "iq-core",
    name: "InfiniteGX IQ Core",
    repository: "msdshopfinds12-spec/msdshopfinds12-spec-infiniteGX.7-IQ-Core",
    version: "unverified",
    status: "not-connected",
    runtime: "external",
    capabilities: ["policy.evaluate", "workflow.route"],
    maxInputChars: 4000,
    requiresHumanApproval: true,
  },
  {
    id: "eve-factory",
    name: "EVE Software Factory",
    repository: "msdshopfinds12-spec/eve-software-factory-template",
    version: "unverified",
    status: "not-connected",
    runtime: "external",
    capabilities: ["code.review", "repo.propose_patch"],
    maxInputChars: 4000,
    requiresHumanApproval: true,
  },
  {
    id: "eve-chat",
    name: "EVE Chat",
    repository: "msdshopfinds12-spec/eve-chat-template",
    version: "unverified",
    status: "not-connected",
    runtime: "external",
    capabilities: ["chat.respond"],
    maxInputChars: 4000,
    requiresHumanApproval: true,
  },
  {
    id: "eve-data",
    name: "EVE Data Agent",
    repository: "msdshopfinds12-spec/eve-data-agent-template",
    version: "unverified",
    status: "not-connected",
    runtime: "external",
    capabilities: ["data.analyze"],
    maxInputChars: 4000,
    requiresHumanApproval: true,
  },
  {
    id: "eve-content",
    name: "EVE Content Agent",
    repository: "msdshopfinds12-spec/eve-content-agent-template",
    version: "unverified",
    status: "not-connected",
    runtime: "external",
    capabilities: ["content.draft"],
    maxInputChars: 4000,
    requiresHumanApproval: true,
  },
  {
    id: "eve-marketing",
    name: "EVE Marketing Team",
    repository: "msdshopfinds12-spec/marketing-team-eve-template",
    version: "unverified",
    status: "not-connected",
    runtime: "external",
    capabilities: ["marketing.plan"],
    maxInputChars: 4000,
    requiresHumanApproval: true,
  },
  {
    id: "personal-agent",
    name: "Personal Agent",
    repository: "msdshopfinds12-spec/personal-agent",
    version: "unverified",
    status: "not-connected",
    runtime: "external",
    capabilities: ["personal.assist"],
    maxInputChars: 4000,
    requiresHumanApproval: true,
  },
]);

function createMockAdapter(): AgentAdapter {
  const manifest: AgentManifest = Object.freeze({
    id: "deterministic-mock",
    name: "Deterministic Mock Adapter",
    repository: "internal",
    version: "1.0.0",
    status: "simulated",
    runtime: "mock",
    capabilities: [
      "policy.evaluate", "workflow.route", "chat.respond", "code.review",
      "repo.propose_patch", "data.analyze", "content.draft", "marketing.plan",
      "personal.assist",
    ] as const,
    maxInputChars: 4000,
    requiresHumanApproval: true,
  });

  return Object.freeze({
    manifest,
    async execute(task: AgentTask): Promise<AgentTaskResult> {
      return Object.freeze({
        operationId: task.operationId,
        agentId: manifest.id,
        status: "simulated",
        summary: "Deterministic mock accepted the task contract. No model, repository, database, or external service was contacted.",
        evidence: Object.freeze(["mode:mock", "provider:none", "external_calls:0"]),
      });
    },
  });
}

export function createAgentRegistry(): AgentRegistry {
  const adapters: readonly AgentAdapter[] = Object.freeze([
    createMockAdapter(),
  ]);

  return Object.freeze({
    list(): readonly AgentManifest[] {
      return Object.freeze([
        ...candidateManifests.map((item) => Object.freeze({ ...item, capabilities: Object.freeze([...item.capabilities]) })),
        ...adapters.map((item) => item.manifest),
      ]);
    },
    get(agentId: string): AgentAdapter | undefined {
      return adapters.find((adapter) => adapter.manifest.id === agentId);
    },
    resolve(capability: AgentCapability): AgentAdapter | undefined {
      return adapters.find((adapter) => adapter.manifest.capabilities.includes(capability));
    },
  });
}
