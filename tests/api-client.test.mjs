import test from "node:test";
import assert from "node:assert/strict";
import { ApiClientError, createApiClient } from "../src/lib/api-client.mjs";

const jsonResponse = (payload, init = {}) => new Response(JSON.stringify(payload), {
  status: init.status ?? 200,
  headers: { "content-type": "application/json", ...(init.headers || {}) },
});

test("requires a valid HTTPS API base URL", () => {
  assert.throws(() => createApiClient({}), /baseUrl/);
  assert.throws(() => createApiClient({ baseUrl: "http://api.example.test" }), /HTTPS/);
  assert.throws(() => createApiClient({ baseUrl: "https://user:pass@example.test" }), /credentials/);
  assert.doesNotThrow(() => createApiClient({ baseUrl: "http://localhost:4000" }));
});

test("sends JSON requests with safe fetch defaults", async () => {
  let observed;
  const client = createApiClient({
    baseUrl: "https://api.example.test/v1/",
    fetchImpl: async (url, init) => {
      observed = { url: String(url), init };
      return jsonResponse({ ok: true });
    },
  });

  const result = await client.request("status", { method: "POST", body: { ping: true } });
  assert.deepEqual(result, { ok: true });
  assert.equal(observed.url, "https://api.example.test/v1/status");
  assert.equal(observed.init.credentials, "omit");
  assert.equal(observed.init.redirect, "error");
  assert.equal(observed.init.cache, "no-store");
  assert.equal(observed.init.headers.get("content-type"), "application/json");
});

test("rejects cross-origin paths before calling fetch", async () => {
  let called = false;
  const client = createApiClient({
    baseUrl: "https://api.example.test",
    fetchImpl: async () => { called = true; return jsonResponse({}); },
  });

  await assert.rejects(
    client.request("https://attacker.example/collect"),
    (error) => error instanceof ApiClientError && error.code === "UNTRUSTED_URL",
  );
  assert.equal(called, false);
});

test("does not expose server response bodies in HTTP errors", async () => {
  const client = createApiClient({
    baseUrl: "https://api.example.test",
    fetchImpl: async () => new Response("private diagnostic payload", { status: 500 }),
  });

  await assert.rejects(client.request("/private"), (error) => {
    assert.equal(error.code, "HTTP_ERROR");
    assert.equal(error.status, 500);
    assert.equal(error.message.includes("private diagnostic"), false);
    return true;
  });
});

test("rejects unexpected content types and malformed JSON", async () => {
  const htmlClient = createApiClient({
    baseUrl: "https://api.example.test",
    fetchImpl: async () => new Response("<html></html>", {
      headers: { "content-type": "text/html" },
    }),
  });
  await assert.rejects(
    htmlClient.request("/data"),
    (error) => error.code === "UNEXPECTED_CONTENT_TYPE",
  );

  const invalidJsonClient = createApiClient({
    baseUrl: "https://api.example.test",
    fetchImpl: async () => new Response("{", {
      headers: { "content-type": "application/json" },
    }),
  });
  await assert.rejects(
    invalidJsonClient.request("/data"),
    (error) => error.code === "INVALID_JSON",
  );
});

test("validates response contracts and supports 204 responses", async () => {
  const client = createApiClient({
    baseUrl: "https://api.example.test",
    fetchImpl: async () => jsonResponse({ id: 7 }),
  });
  await assert.rejects(
    client.request("/record", { validate: (value) => typeof value.id === "string" }),
    (error) => error.code === "INVALID_RESPONSE",
  );

  const emptyClient = createApiClient({
    baseUrl: "https://api.example.test",
    fetchImpl: async () => new Response(null, { status: 204 }),
  });
  assert.equal(await emptyClient.request("/empty"), null);
});

test("rejects request bodies on GET and DELETE", async () => {
  const client = createApiClient({
    baseUrl: "https://api.example.test",
    fetchImpl: async () => jsonResponse({}),
  });
  await assert.rejects(client.request("/records", { body: { id: 1 } }), /must not include/);
  await assert.rejects(
    client.request("/records/1", { method: "DELETE", body: { confirm: true } }),
    /must not include/,
  );
});

test("converts timeouts into a stable error code", async () => {
  const client = createApiClient({
    baseUrl: "https://api.example.test",
    timeoutMs: 5,
    fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    }),
  });

  await assert.rejects(
    client.request("/slow"),
    (error) => error.code === "TIMEOUT",
  );
});

test("rejects unsupported HTTP methods and unsafe timeout values", () => {
  assert.throws(
    () => createApiClient({ baseUrl: "https://api.example.test", timeoutMs: 0 }),
    /timeoutMs/,
  );
  const client = createApiClient({
    baseUrl: "https://api.example.test",
    fetchImpl: async () => jsonResponse({}),
  });
  assert.rejects(client.request("/data", { method: "TRACE" }), /Unsupported HTTP method/);
});
