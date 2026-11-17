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
  assert.deepEqual(
    await client.request("status", { method: "POST", body: { ping: true } }),
    { ok: true },
  );
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

test("accepts JSON and structured +json media types but rejects lookalikes", async () => {
  const accepted = createApiClient({
    baseUrl: "https://api.example.test",
    fetchImpl: async () => jsonResponse({ ok: true }, {
      headers: { "content-type": "application/problem+json; charset=utf-8" },
    }),
  });
  assert.deepEqual(await accepted.request("/data"), { ok: true });

  const rejected = createApiClient({
    baseUrl: "https://api.example.test",
    fetchImpl: async () => new Response("{}", {
      headers: { "content-type": "application/jsonp" },
    }),
  });
  await assert.rejects(
    rejected.request("/data"),
    (error) => error.code === "UNEXPECTED_CONTENT_TYPE",
  );
});

test("rejects malformed JSON and invalid UTF-8", async () => {
  const malformed = createApiClient({
    baseUrl: "https://api.example.test",
    fetchImpl: async () => new Response("{", {
      headers: { "content-type": "application/json" },
    }),
  });
  await assert.rejects(malformed.request("/data"), (error) => error.code === "INVALID_JSON");

  const invalidUtf8 = createApiClient({
    baseUrl: "https://api.example.test",
    fetchImpl: async () => new Response(new Uint8Array([0xff]), {
      headers: { "content-type": "application/json" },
    }),
  });
  await assert.rejects(invalidUtf8.request("/data"), (error) => error.code === "INVALID_JSON");
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

test("rejects oversized request bodies before calling fetch", async () => {
  let called = false;
  const client = createApiClient({
    baseUrl: "https://api.example.test",
    maxRequestBytes: 8,
    fetchImpl: async () => { called = true; return jsonResponse({}); },
  });
  await assert.rejects(
    client.request("/write", { method: "POST", body: { value: "payload too long" } }),
    (error) => error.code === "REQUEST_TOO_LARGE",
  );
  assert.equal(called, false);
});

test("rejects oversized response using content-length before reading", async () => {
  const client = createApiClient({
    baseUrl: "https://api.example.test",
    maxResponseBytes: 4,
    fetchImpl: async () => new Response('{"long":true}', {
      headers: { "content-type": "application/json", "content-length": "13" },
    }),
  });
  await assert.rejects(
    client.request("/large"),
    (error) => error.code === "RESPONSE_TOO_LARGE",
  );
});

test("enforces response byte limit while streaming without content-length", async () => {
  let cancelled = false;
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"value":"'));
      controller.enqueue(new TextEncoder().encode("a".repeat(64)));
      controller.close();
    },
    cancel() { cancelled = true; },
  });
  const client = createApiClient({
    baseUrl: "https://api.example.test",
    maxResponseBytes: 16,
    fetchImpl: async () => new Response(body, {
      headers: { "content-type": "application/json" },
    }),
  });
  await assert.rejects(
    client.request("/stream"),
    (error) => error.code === "RESPONSE_TOO_LARGE",
  );
  assert.equal(cancelled, true);
});

test("converts timeouts and caller cancellation into stable error codes", async () => {
  const timeoutClient = createApiClient({
    baseUrl: "https://api.example.test",
    timeoutMs: 5,
    fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    }),
  });
  await assert.rejects(timeoutClient.request("/slow"), (error) => error.code === "TIMEOUT");

  const abortController = new AbortController();
  abortController.abort();
  const abortClient = createApiClient({
    baseUrl: "https://api.example.test",
    fetchImpl: (_url, { signal }) => Promise.reject(signal.reason),
  });
  await assert.rejects(
    abortClient.request("/cancelled", { signal: abortController.signal }),
    (error) => error.code === "ABORTED",
  );
});

test("rejects unsupported methods and invalid policy limits", async () => {
  assert.throws(
    () => createApiClient({ baseUrl: "https://api.example.test", timeoutMs: 0 }),
    /timeoutMs/,
  );
  assert.throws(
    () => createApiClient({ baseUrl: "https://api.example.test", maxResponseBytes: 0 }),
    /maxResponseBytes/,
  );
  const client = createApiClient({
    baseUrl: "https://api.example.test",
    fetchImpl: async () => jsonResponse({}),
  });
  await assert.rejects(client.request("/data", { method: "TRACE" }), /Unsupported HTTP method/);
});
