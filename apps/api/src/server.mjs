import { createServer } from "node:http";
import { loadConfig } from "./config.mjs";
import { createApp } from "./app.mjs";

const config = loadConfig();
const app = createApp({ config, logger: console });
const server = createServer({
  maxHeaderSize: 8 * 1024,
  requestTimeout: 10_000,
  headersTimeout: 5_000,
  keepAliveTimeout: 5_000
}, app);

server.maxRequestsPerSocket = 100;

server.listen(config.port, config.host, () => {
  console.info(JSON.stringify({
    event: "server_started",
    host: config.host,
    port: config.port,
    nodeEnv: config.nodeEnv,
    authenticationEnabled: config.authenticationEnabled,
    databaseEnabled: config.databaseEnabled,
    aiProvidersEnabled: config.aiProvidersEnabled
  }));
});

function shutdown(signal) {
  console.info(JSON.stringify({ event: "shutdown_started", signal }));
  server.close((error) => {
    if (error) {
      console.error(JSON.stringify({ event: "shutdown_error", name: error.name }));
      process.exitCode = 1;
    }
  });
  server.closeIdleConnections?.();
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

server.on("error", (error) => {
  console.error(JSON.stringify({ event: "server_error", name: error.name, code: error.code }));
  process.exitCode = 1;
});
