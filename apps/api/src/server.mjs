import { createServer } from "node:http";
import { createAppHandler } from "./app.mjs";
import { loadConfig } from "./config.mjs";

const config = loadConfig();
const server = createServer(
  {
    maxHeaderSize: 16 * 1024,
    requestTimeout: 10_000,
    headersTimeout: 5_000,
    keepAliveTimeout: 5_000,
    maxHeadersCount: 50,
  },
  createAppHandler(),
);

server.on("clientError", (_error, socket) => {
  if (socket.writable) {
    socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
  }
});

server.listen(config.port, config.host, () => {
  process.stdout.write(
    JSON.stringify({
      level: "info",
      event: "server_started",
      host: config.host,
      port: config.port,
      environment: config.nodeEnv,
    }) + "\n",
  );
});

let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  process.stdout.write(JSON.stringify({ level: "info", event: "shutdown_started", signal }) + "\n");

  server.close((error) => {
    if (error) {
      process.stderr.write(JSON.stringify({ level: "error", event: "shutdown_failed" }) + "\n");
      process.exitCode = 1;
    }
  });

  server.closeIdleConnections?.();
  setTimeout(() => {
    server.closeAllConnections?.();
  }, 5_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
