export type IntegrationStatus = "not-connected";

export interface AgentIntegration {
  id: string;
  name: string;
  repository: string;
  role: string;
  purpose: string;
  status: IntegrationStatus;
  credentialBoundary: "server-only";
  writeAccess: "disabled";
}

export const agentIntegrations: readonly AgentIntegration[] = Object.freeze([
  {
    id: "iq-core",
    name: "InfiniteGX IQ Core",
    repository: "msdshopfinds12-spec/msdshopfinds12-spec-infiniteGX.7-IQ-Core",
    role: "Core orchestration candidate",
    purpose: "Candidate foundation for deterministic routing, policies, and agent coordination.",
    status: "not-connected",
    credentialBoundary: "server-only",
    writeAccess: "disabled",
  },
  {
    id: "eve-factory",
    name: "EVE Software Factory",
    repository: "msdshopfinds12-spec/eve-software-factory-template",
    role: "Engineering workflow candidate",
    purpose: "Candidate for inspect, plan, implementation proposal, review, and test workflows.",
    status: "not-connected",
    credentialBoundary: "server-only",
    writeAccess: "disabled",
  },
  {
    id: "eve-chat",
    name: "EVE Chat",
    repository: "msdshopfinds12-spec/eve-chat-template",
    role: "Conversation interface candidate",
    purpose: "Candidate conversational interface; persistence and provider wiring require verification.",
    status: "not-connected",
    credentialBoundary: "server-only",
    writeAccess: "disabled",
  },
  {
    id: "eve-data",
    name: "EVE Data Agent",
    repository: "msdshopfinds12-spec/eve-data-agent-template",
    role: "Data workflow candidate",
    purpose: "Candidate for bounded data retrieval and analysis with explicit access controls.",
    status: "not-connected",
    credentialBoundary: "server-only",
    writeAccess: "disabled",
  },
  {
    id: "eve-content",
    name: "EVE Content Agent",
    repository: "msdshopfinds12-spec/eve-content-agent-template",
    role: "Content workflow candidate",
    purpose: "Candidate for content drafting and review workflows.",
    status: "not-connected",
    credentialBoundary: "server-only",
    writeAccess: "disabled",
  },
  {
    id: "eve-marketing",
    name: "EVE Marketing Team",
    repository: "msdshopfinds12-spec/marketing-team-eve-template",
    role: "Marketing workflow candidate",
    purpose: "Candidate for marketing research and campaign planning workflows.",
    status: "not-connected",
    credentialBoundary: "server-only",
    writeAccess: "disabled",
  },
  {
    id: "personal-agent",
    name: "Personal Agent",
    repository: "msdshopfinds12-spec/personal-agent",
    role: "Personal workflow candidate",
    purpose: "Candidate for user-approved personal task orchestration.",
    status: "not-connected",
    credentialBoundary: "server-only",
    writeAccess: "disabled",
  },
]);

export function getIntegrationSummary() {
  return {
    total: agentIntegrations.length,
    connected: agentIntegrations.filter((item) => item.status !== "not-connected").length,
    notConnected: agentIntegrations.filter((item) => item.status === "not-connected").length,
  };
}
