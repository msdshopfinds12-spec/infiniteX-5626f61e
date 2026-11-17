import { describe, expect, it } from "vitest";
import { createAgentRegistry } from "./registry";
import { routeAgentTask } from "./router";

describe("agent adapter registry and router", () => {
  const registry = createAgentRegistry();

  it("labels every repository candidate as not connected", () => {
    const candidates = registry.list().filter((item) => item.repository !== "internal");
    expect(candidates.length).toBe(7);
    expect(candidates.every((item) => item.status === "not-connected")).toBe(true);
  });

  it("routes supported work only to the deterministic mock adapter", async () => {
    const result = await routeAgentTask(registry, {
      operationId: "op-test-001",
      agentId: "deterministic-mock",
      capability: "code.review",
      prompt: "Review a synthetic example.",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.status).toBe("simulated");
      expect(result.result.evidence).toContain("external_calls:0");
    }
  });

  it("blocks disconnected repository candidates", async () => {
    const result = await routeAgentTask(registry, {
      operationId: "op-test-002",
      agentId: "eve-factory",
      capability: "code.review",
      prompt: "Review this repository.",
    });
    expect(result).toEqual({
      ok: false,
      status: 503,
      error: "external_agent_not_connected",
    });
  });

  it("keeps patch-proposal capability explicitly simulated", async () => {
    const result = await routeAgentTask(registry, {
      operationId: "op-test-003",
      agentId: "deterministic-mock",
      capability: "repo.propose_patch",
      prompt: "Propose a synthetic patch.",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.status).toBe("simulated");
      expect(result.result.evidence).toContain("external_calls:0");
    }
  });

  it("rejects malformed operation IDs and oversized prompts", async () => {
    const malformed = await routeAgentTask(registry, {
      operationId: "x",
      agentId: "deterministic-mock",
      capability: "chat.respond",
      prompt: "Hello",
    });
    expect(malformed).toEqual({ ok: false, status: 400, error: "invalid_operation_id" });

    const oversized = await routeAgentTask(registry, {
      operationId: "op-test-004",
      agentId: "deterministic-mock",
      capability: "chat.respond",
      prompt: "x".repeat(4001),
    });
    expect(oversized).toEqual({ ok: false, status: 400, error: "prompt_too_long" });
  });
});
