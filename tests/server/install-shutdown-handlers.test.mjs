import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { installShutdownHandlers } from "../../server/runtime/install-shutdown-handlers.mjs";

test("signal handler drains server and removes both signal listeners", async () => {
  const processLike = new EventEmitter();
  const events = [];
  const server = {
    close(callback) { queueMicrotask(() => callback(null)); },
    closeIdleConnections() {},
  };
  installShutdownHandlers(server, {
    processLike,
    logger: (event) => events.push(event),
  });
  processLike.emit("SIGTERM");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(processLike.listenerCount("SIGINT"), 0);
  assert.equal(processLike.listenerCount("SIGTERM"), 0);
  assert.equal(processLike.exitCode, undefined);
  assert.deepEqual(events.map((event) => event.event), [
    "shutdown_started",
    "shutdown_completed",
  ]);
});

test("failed server close sets a nonzero process exit code", async () => {
  const processLike = new EventEmitter();
  const server = {
    close(callback) { queueMicrotask(() => callback(new Error("close failed"))); },
  };
  installShutdownHandlers(server, { processLike });
  processLike.emit("SIGINT");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(processLike.exitCode, 1);
});

test("handler installation validates process and logger dependencies", () => {
  assert.throws(
    () => installShutdownHandlers({ close() {} }, { processLike: {} }),
    /processLike/,
  );
  assert.throws(
    () => installShutdownHandlers({ close() {} }, { logger: true }),
    /logger/,
  );
});

test("dispose removes handlers without shutting down the server", () => {
  const processLike = new EventEmitter();
  let closeCalls = 0;
  const server = { close() { closeCalls += 1; } };
  const handlers = installShutdownHandlers(server, { processLike });
  handlers.dispose();
  assert.equal(processLike.listenerCount("SIGINT"), 0);
  assert.equal(processLike.listenerCount("SIGTERM"), 0);
  assert.equal(closeCalls, 0);
});
