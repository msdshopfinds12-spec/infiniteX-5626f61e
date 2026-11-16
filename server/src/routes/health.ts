import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config/env.js";

export async function registerHealthRoutes(
  app: FastifyInstance,
  config: AppConfig
): Promise<void> {
  app.get("/health/live", async () => ({
    status: "ok",
    service: "infinitegx-api"
  }));

  app.get("/health/ready", async (_request, reply) => {
    // A configured URL is not proof of a working database connection.
    // Until a real database adapter and ping check are implemented, readiness stays blocked.
    if (!config.DATABASE_URL) {
      return reply.code(503).send({
        status: "not_ready",
        checks: { database: "not_configured" }
      });
    }

    return reply.code(503).send({
      status: "not_ready",
      checks: { database: "adapter_not_implemented" }
    });
  });
}
