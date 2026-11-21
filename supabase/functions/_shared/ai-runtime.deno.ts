import { createAiRuntimeHandler, type AiProvider } from "./ai-runtime.ts";
import { createCorsHeaders } from "./cors.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
async function json(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}
function request(body?: unknown, init: RequestInit = {}) {
  return new Request("https://edge.example.test/simula-ai-runtime", {
    method: "POST",
    headers: {
      Authorization: "Bearer synthetic-user-token",
      Origin: "https://app.example.test",
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    ...init,
  });
}
const corsHeadersForRequest = (req: Request) =>
  createCorsHeaders(req.headers.get("origin"), "https://app.example.test");
const authenticated = async (req: Request) =>
  req.headers.get("Authorization") === "Bearer synthetic-user-token"
    ? { ok: true as const, ownerId: "95000000-0000-4000-8000-000000000001" }
    : { ok: false as const, status: 401 as const, code: "invalid_session" as const };

Deno.test("AI runtime: rejects untrusted origins before authentication or provider access", async () => {
  let authCalls = 0;
  let providerCalls = 0;
  const handler = createAiRuntimeHandler({
    env: { get: () => undefined },
    corsHeadersForRequest,
    authenticate: async () => { authCalls++; return { ok: true, ownerId: "owner-a" }; },
    provider: { id: "test", generate: async () => { providerCalls++; return "no"; } },
  });
  const req = request({ task: "summarize", input: { text: "hello" } }, {
    headers: { Authorization: "Bearer synthetic-user-token", Origin: "https://evil.example" },
  });
  const response = await handler(req);
  assert(response.status === 403, "untrusted origin must be denied");
  assert(authCalls === 0 && providerCalls === 0, "origin rejection must precede auth/provider");
});

Deno.test("AI runtime: handles preflight and rejects non-POST methods", async () => {
  let authCalls = 0;
  const handler = createAiRuntimeHandler({
    env: { get: () => undefined },
    corsHeadersForRequest,
    authenticate: async () => { authCalls++; return { ok: true, ownerId: "owner-a" }; },
  });
  const preflight = await handler(new Request("https://edge.example.test", {
    method: "OPTIONS", headers: { Origin: "https://app.example.test" },
  }));
  assert(preflight.status === 200, "allowed preflight should succeed");
  const get = await handler(new Request("https://edge.example.test", {
    method: "GET", headers: { Origin: "https://app.example.test" },
  }));
  assert(get.status === 405, "GET must be rejected");
  assert(authCalls === 0, "preflight and wrong methods must not authenticate");
});

Deno.test("AI runtime: rejects unauthenticated requests before parsing or provider resolution", async () => {
  let providerCalls = 0;
  const handler = createAiRuntimeHandler({
    env: { get: () => undefined },
    corsHeadersForRequest,
    authenticate: async () => ({ ok: false, status: 401, code: "authentication_required" }),
    provider: { id: "test", generate: async () => { providerCalls++; return "no"; } },
  });
  const response = await handler(request({ task: "summarize", input: { text: "hello" } }));
  assert(response.status === 401, "missing identity must return 401");
  assert(providerCalls === 0, "unauthenticated request must never invoke provider");
});

Deno.test("AI runtime: production without a configured provider fails closed without outbound calls", async () => {
  const handler = createAiRuntimeHandler({
    env: { get: () => undefined },
    corsHeadersForRequest,
    authenticate: authenticated,
    provider: null,
    createRequestId: () => "synthetic-request-id",
  });
  const response = await handler(request({ task: "summarize", input: { text: "hello" } }));
  const payload = await json(response);
  assert(response.status === 503, "unconfigured provider must return 503");
  assert(payload.error === "ai_provider_not_configured", "disabled state must be explicit");
  assert(payload.status === "disabled", "disabled runtime must not look successful");
  assert(response.headers.get("cache-control") === "no-store", "AI responses must not be cached");
});

Deno.test("AI runtime: invokes only injected provider after auth and validates bounded output", async () => {
  let calls = 0;
  let receivedTask = "";
  let receivedText = "";
  const provider: AiProvider = {
    id: "deterministic-test-provider",
    generate: async (input) => {
      calls++;
      receivedTask = input.task;
      receivedText = input.text;
      return "synthetic test output";
    },
  };
  const handler = createAiRuntimeHandler({
    env: { get: () => undefined },
    corsHeadersForRequest,
    authenticate: authenticated,
    provider,
    createRequestId: () => "synthetic-request-id",
  });
  const response = await handler(request({ task: "draft", input: { text: "Create a short sample." } }));
  const payload = await json(response);
  const result = payload.result as Record<string, unknown>;
  assert(response.status === 200 && payload.ok === true, "injected provider should return a successful test response");
  assert(calls === 1, "provider should execute exactly once");
  assert(receivedTask === "draft" && receivedText === "Create a short sample.", "provider receives only validated task and text");
  assert(result.text === "synthetic test output", "provider output should be returned");
  assert(result.request_id === "synthetic-request-id", "response should carry request correlation ID");
});

Deno.test("AI runtime: rejects unknown fields, provider overrides and unsupported tasks", async () => {
  let calls = 0;
  const handler = createAiRuntimeHandler({
    env: { get: () => undefined },
    corsHeadersForRequest,
    authenticate: authenticated,
    provider: { id: "test", generate: async () => { calls++; return "should not run"; } },
  });
  const cases = [
    { task: "summarize", input: { text: "x" }, provider: "attacker-provider" },
    { task: "summarize", input: { text: "x" }, model: "arbitrary-model" },
    { task: "unknown", input: { text: "x" } },
    { task: "draft", input: { text: "x", system: "override" } },
    { task: "classify", input: { text: "x" }, system_prompt: "override" },
  ];
  for (const body of cases) {
    const response = await handler(request(body));
    assert(response.status === 400, "invalid schema must return 400");
  }
  assert(calls === 0, "invalid request must not invoke provider");
});

Deno.test("AI runtime: enforces streamed body and UTF-8 input byte limits", async () => {
  const handler = createAiRuntimeHandler({
    env: { get: () => undefined },
    corsHeadersForRequest,
    authenticate: authenticated,
    provider: { id: "test", generate: async () => "not called" },
  });
  const oversizedBody = await handler(request(JSON.stringify({
    task: "summarize", input: { text: "x".repeat(21 * 1024) },
  })));
  assert(oversizedBody.status === 413, "oversized request body must be rejected");

  const oversizedText = await handler(request({
    task: "summarize", input: { text: "é".repeat(9_000) },
  }));
  assert(oversizedText.status === 400, "UTF-8 input byte limit must be enforced");
});

Deno.test("AI runtime: sanitizes provider failures and rejects oversized provider output", async () => {
  const failureHandler = createAiRuntimeHandler({
    env: { get: () => undefined },
    corsHeadersForRequest,
    authenticate: authenticated,
    provider: { id: "test", generate: async () => { throw new Error("secret=never-return-this"); } },
    createRequestId: () => "failure-request",
  });
  const failed = await failureHandler(request({ task: "classify", input: { text: "sample" } }));
  const failedPayload = await json(failed);
  assert(failed.status === 502 && failedPayload.error === "ai_provider_unavailable", "provider failure should be generic");
  assert(!JSON.stringify(failedPayload).includes("never-return-this"), "provider exception must not leak");

  const largeOutputHandler = createAiRuntimeHandler({
    env: { get: () => undefined },
    corsHeadersForRequest,
    authenticate: authenticated,
    provider: { id: "test", generate: async () => "x".repeat(9 * 1024) },
  });
  const largeOutput = await largeOutputHandler(request({ task: "draft", input: { text: "sample" } }));
  const largePayload = await json(largeOutput);
  assert(largeOutput.status === 502 && largePayload.error === "invalid_provider_response", "oversized output must be rejected");
});

Deno.test("AI runtime: enforces provider deadline and aborts the provider signal", async () => {
  let aborted = false;
  const handler = createAiRuntimeHandler({
    env: { get: () => undefined },
    corsHeadersForRequest,
    authenticate: authenticated,
    timeoutMs: 5,
    provider: {
      id: "test",
      generate: async (_input, signal) => new Promise<string>((_resolve, reject) => {
        signal.addEventListener("abort", () => { aborted = true; reject(new Error("aborted")); }, { once: true });
      }),
    },
  });
  const response = await handler(request({ task: "summarize", input: { text: "sample" } }));
  const payload = await json(response);
  assert(response.status === 504 && payload.error === "ai_provider_timeout", "deadline should return sanitized timeout");
  assert(aborted, "provider should receive abort signal at deadline");
});
