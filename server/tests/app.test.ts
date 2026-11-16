import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import type { AppConfig } from "../src/config/env.js";

const config: AppConfig = {
  NODE_ENV: "test",
  HOST: "127.0.0.1",
  PORT: 3000,
  CORS_ORIGINS: "http://localhost:5173",
  LOG_LEVEL: "silent",
  RATE_LIMIT_MAX: 100,
  RATE_LIMIT_WINDOW: "1 minute"
};

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe("InfiniteGX API foundation", () => {
  it("exposes a liveness endpoint", async () => {
    app = await buildApp(config);
    const response = await app.inject({ method: "GET", url: "/health/live" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "ok", service: "infinitegx-api" });
  });

  it("does not claim readiness before a database adapter exists", async () => {
    app = await buildApp(config);
    const response = await app.inject({ method: "GET", url: "/health/ready" });

    expect(response.statusCode).toBe(503);
    expect(response.json().status).toBe("not_ready");
  });

  it("labels unfinished integrations honestly", async () => {
    app = await buildApp(config);
    const response = await app.inject({ method: "GET", url: "/api/v1/capabilities" });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.capabilities.authentication).toBe("not_implemented");
    expect(body.capabilities.aiProviders).toBe("not_implemented");
  });

  it("rejects unapproved browser origins", async () => {
    app = await buildApp(config);
    const response = await app.inject({
      method: "GET",
      url: "/health/live",
      headers: { origin: "https://untrusted.example" }
    });

    expect(response.statusCode).toBe(500);
  });
});
