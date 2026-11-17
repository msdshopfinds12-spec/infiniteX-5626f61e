import type { AuditSink, GatewayAuditEvent, RateLimiter } from "./contracts";
import { candidateAgentManifests, type CandidateAgentId } from "./contracts";
import { createRateLimiter, isPrivilegedCapability, isTaskCapability, MAX_BODY_BYTES, parseGatewayPayload } from "./policy";

type HeaderValue = string | readonly string[] | undefined;
export interface GatewayRequest {
  readonly method?: string;
  readonly headers: Readonly<Record<string, HeaderValue>>;
  readonly body?: unknown;
  readonly socket?: { readonly remoteAddress?: string };
}
export interface GatewayResponse {
  setHeader(name: string, value: string): void;
  status(code: number): GatewayResponse;
  json(body: unknown): void;
}
export interface GatewayHandlerOptions {
  readonly mode: "mock" | "disabled";
  readonly now?: () => number;
  readonly rateLimiter?: RateLimiter;
  readonly auditSink?: AuditSink;
}

export function createMemoryAuditSink(maxEvents = 100) {
  if (!Number.isInteger(maxEvents) || maxEvents < 1 || maxEvents > 1000) throw new RangeError("maxEvents must be 1..1000.");
  const events: GatewayAuditEvent[] = [];
  return {
    record(event: GatewayAuditEvent) {
      events.unshift(Object.freeze({ ...event }));
      if (events.length > maxEvents) events.length = maxEvents;
    },
    list(): readonly GatewayAuditEvent[] { return events.map((event) => ({ ...event })); },
  };
}

function getHeader(req: GatewayRequest, name: string): string | undefined {
  const value = req.headers[name.toLowerCase()];
  return typeof value === "string" ? value : value?.[0];
}
function securityHeaders(res: GatewayResponse) {
  res.setHeader("Cache-Control","no-store");
  res.setHeader("X-Content-Type-Options","nosniff");
  res.setHeader("Referrer-Policy","no-referrer");
  res.setHeader("Content-Security-Policy","default-src 'none'; frame-ancestors 'none'");
  res.setHeader("Vary","Origin");
}
function send(res: GatewayResponse, status: number, body: Record<string, unknown>) { res.status(status).json(body); }
function byteLength(body: unknown) {
  try {
    const text = typeof body === "string" ? body : JSON.stringify(body ?? null);
    return new TextEncoder().encode(text).length;
  } catch { return MAX_BODY_BYTES + 1; }
}
function parseBody(body: unknown): { ok:true; value:unknown } | { ok:false } {
  if (typeof body !== "string") return { ok:true, value:body };
  try { return { ok:true, value:JSON.parse(body) as unknown }; } catch { return { ok:false }; }
}
function sameOrigin(req: GatewayRequest) {
  const origin = getHeader(req,"origin");
  if (!origin) return true;
  const host = getHeader(req,"host");
  if (!host) return false;
  try { return new URL(origin).host.toLowerCase() === host.toLowerCase(); } catch { return false; }
}
function preferredCandidate(capability: string) {
  const mapping: Record<string,CandidateAgentId> = {
    "chat.respond":"eve-chat", "code.review":"eve-factory", "data.analyze":"eve-data",
    "content.draft":"eve-content", "marketing.plan":"eve-marketing", "personal.assist":"personal-agent",
  };
  const id = mapping[capability];
  return candidateAgentManifests.find((candidate) => candidate.id === id);
}

export function createAiGatewayHandler(options: GatewayHandlerOptions) {
  const now = options.now ?? Date.now;
  const rateLimit = options.rateLimiter ?? createRateLimiter({ now });
  const audit = options.auditSink ?? createMemoryAuditSink();
  let sequence = 0;

  function record(operationId: string, capability: GatewayAuditEvent["capability"], decision: GatewayAuditEvent["decision"], reason: string, inputLength?: number, adapterId: GatewayAuditEvent["adapterId"] = "none") {
    const eventId = "audit-" + operationId;
    audit.record({
      eventId, operationId, timestamp:new Date(now()).toISOString(), capability,
      decision, reason, adapterId, inputLength,
    });
    return eventId;
  }

  return function aiGatewayHandler(req: GatewayRequest, res: GatewayResponse) {
    securityHeaders(res);
    if (req.method !== "POST") return send(res,405,{ error:"method_not_allowed" });
    if (options.mode !== "mock") return send(res,503,{ error:"gateway_disabled", message:"No AI provider or external runtime is enabled." });
    if (!sameOrigin(req)) return send(res,403,{ error:"origin_not_allowed" });

    const length = Number(getHeader(req,"content-length") ?? "0");
    if (Number.isFinite(length) && length > MAX_BODY_BYTES) return send(res,413,{ error:"request_too_large" });
    if (!(getHeader(req,"content-type") ?? "").toLowerCase().startsWith("application/json")) return send(res,415,{ error:"application_json_required" });

    const limit = rateLimit(req.socket?.remoteAddress ?? "unknown");
    if (!limit.allowed) {
      res.setHeader("Retry-After",String(limit.retryAfterSeconds));
      return send(res,429,{ error:"rate_limit_exceeded" });
    }
    if (byteLength(req.body) > MAX_BODY_BYTES) return send(res,413,{ error:"request_too_large" });

    const parsed = parseBody(req.body);
    if (!parsed.ok) return send(res,400,{ error:"invalid_json" });
    const validated = parseGatewayPayload(parsed.value);
    if (!validated.ok) return send(res,validated.reason === "prompt_too_long" ? 413 : 400,{ error:validated.reason });

    const { capability, prompt } = validated.value;
    const operationId = "op-" + Math.floor(now()).toString(36) + "-" + (++sequence).toString(36);

    if (isPrivilegedCapability(capability)) {
      const auditEventId = record(operationId,capability,"blocked","human_approval_required_not_implemented_in_phase_3a",prompt.length);
      return send(res,403,{
        error:"human_approval_required", operationId, auditEventId,
        message:"Privileged execution is blocked. Phase 3A does not implement approval tokens or external writes.",
      });
    }
    if (!isTaskCapability(capability)) return send(res,400,{ error:"capability_not_executable" });

    const candidate = preferredCandidate(capability);
    if (!candidate) return send(res,500,{ error:"candidate_registry_inconsistent" });
    const auditEventId = record(operationId,capability,"simulated","deterministic_mock_only_no_external_call",prompt.length,"deterministic-mock");

    return send(res,200,{
      operationId, auditEventId, status:"simulated", mode:"mock",
      provider:"none", adapterId:"deterministic-mock",
      preferredCandidate:{ id:candidate.id, name:candidate.name, status:candidate.status },
      message:"Request validated and routed in deterministic mock mode. No AI model, repository, database, or external service was contacted.",
    });
  };
}
