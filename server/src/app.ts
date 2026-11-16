import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { loadEnv, parseCorsOrigins, type AppConfig } from "./config/env.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerCapabilityRoutes } from "./routes/capabilities.js";

export async function buildApp(config: AppConfig = loadEnv()): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          "headers.authorization",
          "headers.cookie",
          "*.apiKey",
          "*.accessToken",
          "*.refreshToken"
        ],
        censor: "[REDACTED]"
      }
    },
    trustProxy: false,
    bodyLimit: 1_048_576
  });

  const allowedOrigins = new Set(parseCorsOrigins(config.CORS_ORIGINS));

  await app.register(helmet);
  await app.register(cors, {
    credentials: false,
    origin(origin, callback) {
      // Non-browser clients may omit Origin. Browser origins must be explicitly allowed.
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Origin not allowed"), false);
    }
  });
  await app.register(rateLimit, {
    max: config.RATE_LIMIT_MAX,
    timeWindow: config.RATE_LIMIT_WINDOW
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, "Request failed");
    const statusCode = error.statusCode && error.statusCode >= 400 && error.statusCode < 500
      ? error.statusCode
      : 500;

    return reply.code(statusCode).send({
      error: statusCode === 500 ? "INTERNAL_SERVER_ERROR" : "REQUEST_ERROR",
      message: statusCode === 500 ? "An unexpected error occurred." : error.message
    });
  });

  await registerHealthRoutes(app, config);
  await registerCapabilityRoutes(app);

  return app;
}
