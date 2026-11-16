import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createAppHandler } from "../src/app.mjs";
import { loadConfig } from "../src/config.mjs";

async function withServer(handler, run) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

test("health endpoint returns minimal service status and security headers", async () => {
  await withServer(createAppHandler(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/healthz`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.status, "ok");
    assert.equal(body.service, "infinite-x-api");
    assert.match(body.requestId, /^[0-9a-f-]{36}$/i);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("x-request-id"), body.requestId);
  });
});

test("readiness endpoint reports unavailable dependency state", async () => {
  await withServer(createAppHandler({ readinessCheck: async () => false }), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/readyz`);
    const body = await response.json();

    assert.equal(response.status, 503);
    assert.equal(body.status, "not_ready");
  });
});

test("unknown routes return a stable JSON 404", async () => {
  await withServer(createAppHandler(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/missing`);
    const body = await response.json();

    assert.equal(response.status, 404);
    assert.equal(body.error.code, "NOT_FOUND");
  });
});

test("non-read methods are rejected", async () => {
  await withServer(createAppHandler(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/healthz`, { method: "POST" });
    const body = await response.json();

    assert.equal(response.status, 405);
    assert.equal(body.error.code, "METHOD_NOT_ALLOWED");
  });
});

test("configuration defaults to loopback and validates port", () => {
  const config = loadConfig({});
  assert.equal(config.host, "127.0.0.1");
  assert.equal(config.port, 4100);

  assert.throws(
    () => loadConfig({ API_PORT: "70000" }),
    /API_PORT must be an integer/,
  );
});

test("configuration rejects unknown environment modes", () => {
  assert.throws(
    () => loadConfig({ NODE_ENV: "production-ish" }),
    /NODE_ENV must be development, test, or production/,
  );
});
