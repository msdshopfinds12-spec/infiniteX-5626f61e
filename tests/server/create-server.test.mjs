import test from "node:test";
import assert from "node:assert/strict";
import { createInfiniteXServer } from "../../server/http/create-server.mjs";

async function withServer(options, run) {
  const server = createInfiniteXServer(options);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("health endpoint returns liveness without claiming dependencies are ready", async () => {
  await withServer({ readinessCheck: async () => false }, async (base) => {
    const response = await fetch(`${base}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ok" });
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.ok(response.headers.get("x-request-id"));
  });
});

test("ready endpoint returns 200 only when readiness dependency check passes", async () => {
  await withServer({ readinessCheck: async () => true }, async (base) => {
    const response = await fetch(`${base}/ready`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ready" });
  });
});

test("ready endpoint fails closed when dependency check throws", async () => {
  await withServer({ readinessCheck: async () => { throw new Error("private database details"); } }, async (base) => {
    const response = await fetch(`${base}/ready`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { status: "not_ready" });
    assert.doesNotMatch(await response.text(), /private database details/);
  });
});

test("unknown routes return a generic 404 response", async () => {
  await withServer({}, async (base) => {
    const response = await fetch(`${base}/private?token=must-not-be-logged`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "not_found" });
  });
});

test("non-read methods are rejected and advertise allowed methods", async () => {
  await withServer({}, async (base) => {
    const response = await fetch(`${base}/health`, { method: "POST" });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get("allow"), "GET, HEAD");
  });
});

test("responses include baseline security headers", async () => {
  await withServer({}, async (base) => {
    const response = await fetch(`${base}/health`);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("x-frame-options"), "DENY");
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.match(response.headers.get("content-security-policy"), /default-src 'none'/);
  });
});

test("structured logs omit query strings and request headers", async () => {
  const entries = [];
  await withServer({ logger: (entry) => entries.push(entry) }, async (base) => {
    await fetch(`${base}/health?access_token=never-log-this`, {
      headers: { authorization: "Bearer never-log-this" },
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(entries.length, 1);
    assert.equal(entries[0].route, "/health");
    assert.equal("headers" in entries[0], false);
    assert.doesNotMatch(JSON.stringify(entries), /never-log-this/);
  });
});

test("logger failures do not break successful requests", async () => {
  await withServer({ logger: () => { throw new Error("logger unavailable"); } }, async (base) => {
    const response = await fetch(`${base}/health`);
    assert.equal(response.status, 200);
  });
});

test("readiness fails closed when no dependency check is injected", async () => {
  await withServer({}, async (base) => {
    const response = await fetch(`${base}/ready`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { status: "not_ready" });
  });
});

test("HEAD health requests return headers without a response body", async () => {
  await withServer({}, async (base) => {
    const response = await fetch(`${base}/health`, { method: "HEAD" });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "");
    assert.ok(response.headers.get("content-length"));
  });
});
