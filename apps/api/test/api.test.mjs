import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createApp } from "../src/app.mjs";
import { loadConfig } from "../src/config.mjs";

async function withServer(handler, run) {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

const testConfig = loadConfig({ NODE_ENV: "test" });

test("health endpoint returns a non-cacheable success and security headers", async () => {
  await withServer(createApp({ config: testConfig }), async (base) => {
    const response = await fetch(`${base}/healthz`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal((await response.json()).status, "ok");
  });
});

test("readiness remains unavailable until dependencies are actually configured", async () => {
  await withServer(createApp({ config: testConfig }), async (base) => {
    const response = await fetch(`${base}/readyz`);
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.checks.authentication, "disabled");
    assert.equal(body.checks.database, "disabled");
  });
});

test("unknown routes return 404 without revealing internals", async () => {
  await withServer(createApp({ config: testConfig }), async (base) => {
    const response = await fetch(`${base}/private-debug`);
    assert.equal(response.status, 404);
    assert.equal((await response.json()).error.code, "NOT_FOUND");
  });
});

test("non-read methods are rejected", async () => {
  await withServer(createApp({ config: testConfig }), async (base) => {
    const response = await fetch(`${base}/healthz`, { method: "POST" });
    assert.equal(response.status, 405);
  });
});

test("untrusted origins are rejected", async () => {
  const config = loadConfig({ NODE_ENV: "test", ALLOWED_ORIGINS: "https://app.example.test" });
  await withServer(createApp({ config }), async (base) => {
    const response = await fetch(`${base}/api/v1/status`, {
      headers: { Origin: "https://attacker.example" }
    });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error.code, "ORIGIN_NOT_ALLOWED");
  });
});

test("trusted origins receive exact-origin CORS response", async () => {
  const config = loadConfig({ NODE_ENV: "test", ALLOWED_ORIGINS: "https://app.example.test" });
  await withServer(createApp({ config }), async (base) => {
    const response = await fetch(`${base}/api/v1/status`, {
      headers: { Origin: "https://app.example.test" }
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), "https://app.example.test");
  });
});

test("production config fails closed without explicit origin allowlist", () => {
  assert.throws(
    () => loadConfig({ NODE_ENV: "production", HOST: "0.0.0.0" }),
    /ALLOWED_ORIGINS is required/
  );
});

test("production config rejects wildcard and non-canonical origins", () => {
  assert.throws(
    () => loadConfig({ NODE_ENV: "production", HOST: "0.0.0.0", ALLOWED_ORIGINS: "*" }),
    /valid absolute origins/
  );
  assert.throws(
    () => loadConfig({ NODE_ENV: "production", HOST: "0.0.0.0", ALLOWED_ORIGINS: "https://example.test/path" }),
    /canonical/
  );
});

test("invalid port and body limits are rejected", () => {
  assert.throws(() => loadConfig({ NODE_ENV: "test", PORT: "0" }), /PORT/);
  assert.throws(() => loadConfig({ NODE_ENV: "test", BODY_LIMIT_BYTES: "999999999" }), /BODY_LIMIT_BYTES/);
});
