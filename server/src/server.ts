import { buildApp } from "./app.js";
import { loadEnv } from "./config/env.js";

const config = loadEnv();
const app = await buildApp(config);

const shutdown = async (signal: string): Promise<void> => {
  app.log.info({ signal }, "Graceful shutdown started");
  try {
    await app.close();
    process.exit(0);
  } catch (error) {
    app.log.error({ err: error }, "Graceful shutdown failed");
    process.exit(1);
  }
};

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));

try {
  await app.listen({ host: config.HOST, port: config.PORT });
} catch (error) {
  app.log.error({ err: error }, "API startup failed");
  process.exit(1);
}
