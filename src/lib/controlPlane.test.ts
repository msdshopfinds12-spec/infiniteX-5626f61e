import { describe, expect, it } from "vitest";
import { agentIntegrations, getIntegrationSummary } from "./agentRegistry";
import { canExecuteRemoteAction, getExecutionMode, requiresHumanApproval } from "./workflowPolicy";

describe("InfiniteX execution safety policy", () => {
  it("does not treat inspection, planning, or proposals as repository writes", () => {
    expect(requiresHumanApproval("inspect")).toBe(false);
    expect(requiresHumanApproval("plan")).toBe(false);
    expect(requiresHumanApproval("propose")).toBe(false);
  });

  it("requires human approval for write and production-impacting actions", () => {
    for (const action of ["write", "merge", "deploy", "secrets", "migration", "billing"] as const) {
      expect(requiresHumanApproval(action)).toBe(true);
    }
  });

  it("keeps remote execution disabled until a server adapter is verified", () => {
    expect(canExecuteRemoteAction()).toBe(false);
    expect(getExecutionMode()).toBe("local-demo");
  });

  it("lists repository candidates without claiming live connections", () => {
    expect(agentIntegrations.length).toBeGreaterThan(0);
    expect(agentIntegrations.every((item) => item.status === "not-connected")).toBe(true);
    expect(getIntegrationSummary()).toEqual({
      total: agentIntegrations.length,
      connected: 0,
      notConnected: agentIntegrations.length,
    });
  });

  it("keeps candidate credentials server-side and write access disabled", () => {
    expect(agentIntegrations.every((item) => item.credentialBoundary === "server-only")).toBe(true);
    expect(agentIntegrations.every((item) => item.writeAccess === "disabled")).toBe(true);
  });
});
