export const taskCapabilities = [
  "chat.respond", "code.review", "data.analyze",
  "content.draft", "marketing.plan", "personal.assist",
] as const;

export const privilegedCapabilities = [
  "repo.write_branch", "repo.merge", "ci.rerun", "deployment.release",
  "database.migrate", "secrets.manage", "billing.manage", "content.publish",
] as const;

export type TaskCapability = (typeof taskCapabilities)[number];
export type PrivilegedCapability = (typeof privilegedCapabilities)[number];
export type GatewayCapability = TaskCapability | PrivilegedCapability;
export type CandidateAgentId =
  | "iq-core" | "eve-factory" | "eve-chat" | "eve-data"
  | "eve-content" | "eve-marketing" | "personal-agent";

export interface CandidateAgentManifest {
  readonly id: CandidateAgentId;
  readonly name: string;
  readonly repository: string;
  readonly status: "not-connected";
  readonly capabilities: readonly string[];
  readonly requiresExternalRuntime: true;
}

export const candidateAgentManifests: readonly CandidateAgentManifest[] = Object.freeze([
  { id:"iq-core", name:"InfiniteGX IQ Core", repository:"msdshopfinds12-spec/msdshopfinds12-spec-infiniteGX.7-IQ-Core", status:"not-connected", capabilities:["policy.evaluate","workflow.route"], requiresExternalRuntime:true },
  { id:"eve-factory", name:"EVE Software Factory", repository:"msdshopfinds12-spec/eve-software-factory-template", status:"not-connected", capabilities:["code.review","repo.propose_patch"], requiresExternalRuntime:true },
  { id:"eve-chat", name:"EVE Chat", repository:"msdshopfinds12-spec/eve-chat-template", status:"not-connected", capabilities:["chat.respond"], requiresExternalRuntime:true },
  { id:"eve-data", name:"EVE Data Agent", repository:"msdshopfinds12-spec/eve-data-agent-template", status:"not-connected", capabilities:["data.analyze"], requiresExternalRuntime:true },
  { id:"eve-content", name:"EVE Content Agent", repository:"msdshopfinds12-spec/eve-content-agent-template", status:"not-connected", capabilities:["content.draft"], requiresExternalRuntime:true },
  { id:"eve-marketing", name:"EVE Marketing Team", repository:"msdshopfinds12-spec/marketing-team-eve-template", status:"not-connected", capabilities:["marketing.plan"], requiresExternalRuntime:true },
  { id:"personal-agent", name:"Personal Agent", repository:"msdshopfinds12-spec/personal-agent", status:"not-connected", capabilities:["personal.assist"], requiresExternalRuntime:true },
]);

export interface GatewayAuditEvent {
  readonly eventId: string;
  readonly operationId: string;
  readonly timestamp: string;
  readonly capability?: GatewayCapability;
  readonly decision: "simulated" | "blocked" | "rejected";
  readonly reason: string;
  readonly adapterId: "deterministic-mock" | "none";
  readonly inputLength?: number;
}

export interface AuditSink { record(event: GatewayAuditEvent): void; }
export interface RateLimitDecision { readonly allowed: boolean; readonly retryAfterSeconds: number; }
export type RateLimiter = (key: string) => RateLimitDecision;
