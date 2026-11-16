import test from "node:test";
import assert from "node:assert/strict";
import { createShutdownController } from "../../server/runtime/shutdown.mjs";

test("shutdown is idempotent and closes idle connections after stopping accepts", async () => {
  const calls = [];
  const server = {
    close(callback) {
      calls.push("close");
      queueMicrotask(() => callback(null));
    },
    closeIdleConnections() { calls.push("idle"); },
  };
  const controller = createShutdownController(server);
  const first = controller.shutdown();
  const second = controller.shutdown();
  assert.equal(first, second);
  const result = await first;
  assert.deepEqual(result, { closed: true, timedOut: false, error: null });
  assert.deepEqual(calls, ["close", "idle"]);
});

test("shutdown force-closes active connections after its deadline", async () => {
  let closeCallback;
  let forced = 0;
  let timeoutNotified = 0;
  const server = {
    close(callback) { closeCallback = callback; },
    closeAllConnections() {
      forced += 1;
      closeCallback(null);
    },
  };
  const controller = createShutdownController(server, {
    timeoutMs: 10,
    onTimeout: () => { timeoutNotified += 1; },
  });
  const result = await controller.shutdown();
  assert.deepEqual(result, { closed: true, timedOut: true, error: null });
  assert.equal(forced, 1);
  assert.equal(timeoutNotified, 1);
});

test("shutdown timeout observer errors do not block forced close", async () => {
  let closeCallback;
  let forced = 0;
  const server = {
    close(callback) { closeCallback = callback; },
    closeAllConnections() {
      forced += 1;
      closeCallback(null);
    },
  };
  const controller = createShutdownController(server, {
    timeoutMs: 10,
    onTimeout: () => { throw new Error("observer failed"); },
  });
  const result = await controller.shutdown();
  assert.equal(result.closed, true);
  assert.equal(result.timedOut, true);
  assert.equal(forced, 1);
});

test("shutdown controller rejects invalid dependencies and timeout values", () => {
  assert.throws(() => createShutdownController(null), /server/);
  assert.throws(() => createShutdownController({ close() {} }, { timeoutMs: 0 }), /timeoutMs/);
  assert.throws(() => createShutdownController({ close() {} }, { timeoutMs: 120_001 }), /timeoutMs/);
  assert.throws(() => createShutdownController({ close() {} }, { onTimeout: true }), /onTimeout/);
});
