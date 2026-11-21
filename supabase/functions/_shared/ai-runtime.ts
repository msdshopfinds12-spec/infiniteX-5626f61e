import { readJsonBodyLimited } from "./worker-security.mjs";
import type { CorsResult } from "./cors.ts";

export type AiTask = "summarize" | "draft" | "classify";
export type AiRuntimeInput = Readonly<{ task: AiTask; text: string }>;
export type AiProvider = Readonly<{
  id: string;
  generate(input: AiRuntimeInput, signal: AbortSignal): Promise<string>;
}>;
export type AiAuthResult =
  | Readonly<{ ok: true; ownerId: string }>
  | Readonly<{ ok: false; status: 401 | 500; code: "authentication_required" | "invalid_session" | "server_configuration_error" }>;

export type AiRuntimeDependencies = Readonly<{
  env: { get(name: string): string | undefined };
  corsHeadersForRequest(request: Request): CorsResult;
  authenticate(request: Request): Promise<AiAuthResult>;
  provider?: AiProvider | null;
  timeoutMs?: number;
  createRequestId?: () => string;
}>;

const MAX_BODY_BYTES = 20 * 1024;
const MAX_INPUT_BYTES = 16 * 1024;
const MAX_OUTPUT_BYTES = 8 * 1024;
const DEFAULT_TIMEOUT_MS = 12_000;
const ALLOWED_TASKS = new Set<AiTask>(["summarize", "draft", "classify"]);
const ALLOWED_BODY_KEYS = new Set(["task", "input"]);

function jsonResponse(status: number, payload: Record<string, unknown>, cors: CorsResult) {
  const headers = new Headers(cors.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(JSON.stringify(payload), { status, headers });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateRequest(value: unknown): AiRuntimeInput | null {
  if (!isRecord(value) || Object.keys(value).some((key) => !ALLOWED_BODY_KEYS.has(key))) return null;
  if (typeof value.task !== "string" || !ALLOWED_TASKS.has(value.task as AiTask)) return null;
  if (!isRecord(value.input) || Object.keys(value.input).some((key) => key !== "text")) return null;
  if (typeof value.input.text !== "string" || value.input.text.trim().length === 0) return null;
  if (new TextEncoder().encode(value.input.text).byteLength > MAX_INPUT_BYTES) return null;
  return { task: value.task as AiTask, text: value.input.text };
}

function requestId(deps: AiRuntimeDependencies): string {
  return deps.createRequestId?.() ?? crypto.randomUUID();
}

export function createAiRuntimeHandler(deps: AiRuntimeDependencies) {
  const timeoutMs = Number.isInteger(deps.timeoutMs) && (deps.timeoutMs ?? 0) > 0
    ? Math.min(deps.timeoutMs as number, DEFAULT_TIMEOUT_MS)
    : DEFAULT_TIMEOUT_MS;

  return async (request: Request): Promise<Response> => {
    const cors = deps.corsHeadersForRequest(request);
    if (!cors.allowed) return new Response("origin_not_allowed", { status: 403, headers: cors.headers });
    if (request.method === "OPTIONS") return new Response("ok", { status: 200, headers: cors.headers });
    if (request.method !== "POST") {
      return jsonResponse(405, { ok: false, error: "method_not_allowed" }, cors);
    }

    let auth: AiAuthResult;
    try {
      auth = await deps.authenticate(request);
    } catch {
      return jsonResponse(500, { ok: false, error: "authentication_unavailable" }, cors);
    }
    if (!auth.ok) return jsonResponse(auth.status, { ok: false, error: auth.code }, cors);

    const body = await readJsonBodyLimited(request, MAX_BODY_BYTES);
    if (!body.ok) {
      const status = body.reason === "payload_too_large" ? 413 : 400;
      return jsonResponse(status, { ok: false, error: body.reason }, cors);
    }
    const input = validateRequest(body.value);
    if (!input) return jsonResponse(400, { ok: false, error: "invalid_ai_request" }, cors);

    // Production is deliberately fail-closed until a provider and quota policy are approved.
    const provider = deps.provider ?? null;
    if (!provider) {
      return jsonResponse(503, {
        ok: false,
        error: "ai_provider_not_configured",
        capability: "ai_generation",
        status: "disabled",
      }, cors);
    }

    const id = requestId(deps);
    const controller = new AbortController();
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        controller.abort();
        reject(new Error("provider_timeout"));
      }, timeoutMs);
    });

    try {
      const output = await Promise.race([
        provider.generate(input, controller.signal),
        timeout,
      ]);
      if (typeof output !== "string" || output.trim().length === 0
          || new TextEncoder().encode(output).byteLength > MAX_OUTPUT_BYTES) {
        return jsonResponse(502, { ok: false, error: "invalid_provider_response", request_id: id }, cors);
      }
      return jsonResponse(200, {
        ok: true,
        result: { text: output, request_id: id },
      }, cors);
    } catch (error) {
      controller.abort();
      const timedOut = error instanceof Error && error.message === "provider_timeout";
      return jsonResponse(timedOut ? 504 : 502, {
        ok: false,
        error: timedOut ? "ai_provider_timeout" : "ai_provider_unavailable",
        request_id: id,
      }, cors);
    } finally {
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
    }
  };
}
