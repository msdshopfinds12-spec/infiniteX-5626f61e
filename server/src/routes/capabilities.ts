import type { FastifyInstance } from "fastify";

const capabilities = {
  api: "implemented",
  authentication: "not_implemented",
  database: "not_implemented",
  aiProviders: "not_implemented",
  agents: "not_implemented",
  pipelines: "not_implemented",
  usageMetering: "not_implemented"
} as const;

export async function registerCapabilityRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/capabilities", async () => ({
    mode: "foundation",
    capabilities
  }));
}
