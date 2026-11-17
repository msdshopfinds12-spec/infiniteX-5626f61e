import { describe, expect, it } from "vitest";
import { createAiGatewayHandler, createMemoryAuditSink, type GatewayRequest, type GatewayResponse } from "./handler";
import { createRateLimiter } from "./policy";

function request(overrides: Partial<GatewayRequest> = {}): GatewayRequest {
  return {
    method:"POST",
    headers:{ host:"infinitex.example", origin:"https://infinitex.example", "content-type":"application/json" },
    body:{ capability:"code.review", input:{ prompt:"Review this TypeScript module." } },
    socket:{ remoteAddress:"127.0.0.1" },
    ...overrides,
  };
}
function response() {
  const headers: Record<string,string> = {};
  let statusCode = 200;
  let payload: unknown;
  const res: GatewayResponse = {
    setHeader(name,value) { headers[name.toLowerCase()] = value; },
    status(code) { statusCode = code; return res; },
    json(body) { payload = body; },
  };
  return { res, headers, get statusCode(){return statusCode;}, get payload(){return payload as Record<string,unknown>;} };
}

describe("InfiniteX server-side AI gateway", () => {
  it("runs deterministic mock routing without a provider or prompt echo", () => {
    const handler = createAiGatewayHandler({ mode:"mock", now:()=>1_800_000_000_000 });
    const out = response();
    handler(request(),out.res);
    expect(out.statusCode).toBe(200);
    expect(out.payload.status).toBe("simulated");
    expect(out.payload.provider).toBe("none");
    expect(out.payload.adapterId).toBe("deterministic-mock");
    expect(out.payload.message).toContain("No AI model");
    expect(JSON.stringify(out.payload)).not.toContain("Review this TypeScript module.");
    expect(out.payload.preferredCandidate).toEqual({ id:"eve-factory", name:"EVE Software Factory", status:"not-connected" });
  });
  it("fails closed when mock mode is disabled", () => {
    const out = response();
    createAiGatewayHandler({mode:"disabled"})(request(),out.res);
    expect(out.statusCode).toBe(503);
  });
  it("allows only POST", () => {
    const out = response();
    createAiGatewayHandler({mode:"mock"})(request({method:"GET"}),out.res);
    expect(out.statusCode).toBe(405);
  });
  it("rejects cross-origin browser requests", () => {
    const out = response();
    createAiGatewayHandler({mode:"mock"})(request({headers:{host:"infinitex.example",origin:"https://evil.example","content-type":"application/json"}}),out.res);
    expect(out.statusCode).toBe(403);
  });
  it("requires JSON content", () => {
    const out = response();
    createAiGatewayHandler({mode:"mock"})(request({headers:{host:"infinitex.example","content-type":"text/plain"}}),out.res);
    expect(out.statusCode).toBe(415);
  });
  it("rejects malformed JSON and extra fields", () => {
    const handler = createAiGatewayHandler({mode:"mock"});
    const malformed = response();
    handler(request({body:"{bad"}),malformed.res);
    expect(malformed.statusCode).toBe(400);
    const extra = response();
    handler(request({body:{capability:"chat.respond",input:{prompt:"hello"},approved:true}}),extra.res);
    expect(extra.payload.error).toBe("unknown_request_fields");
  });
  it("blocks privileged capabilities regardless of client-supplied intent", () => {
    const audit = createMemoryAuditSink();
    const out = response();
    createAiGatewayHandler({mode:"mock",auditSink:audit})(request({body:{capability:"repo.write_branch",input:{prompt:"write"}}}),out.res);
    expect(out.statusCode).toBe(403);
    expect(out.payload.error).toBe("human_approval_required");
    expect(audit.list()[0].decision).toBe("blocked");
  });
  it("enforces prompt and body size limits", () => {
    const handler = createAiGatewayHandler({mode:"mock"});
    const longPrompt = response();
    handler(request({body:{capability:"chat.respond",input:{prompt:"x".repeat(4001)}}}),longPrompt.res);
    expect(longPrompt.statusCode).toBe(413);
    const largeBody = response();
    handler(request({headers:{host:"infinitex.example",origin:"https://infinitex.example","content-type":"application/json","content-length":"9000"}}),largeBody.res);
    expect(largeBody.statusCode).toBe(413);
  });
  it("rate-limits requests and recovers after the window", () => {
    let time = 1_800_000_000_000;
    const limiter = createRateLimiter({maxRequests:1,windowMs:60_000,now:()=>time});
    const handler = createAiGatewayHandler({mode:"mock",rateLimiter:limiter,now:()=>time});
    const first = response(); handler(request(),first.res);
    const second = response(); handler(request(),second.res);
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(429);
    expect(second.headers["retry-after"]).toBeDefined();
    time += 60_001;
    const third = response(); handler(request(),third.res);
    expect(third.statusCode).toBe(200);
  });
  it("records metadata only and sets defensive response headers", () => {
    const audit = createMemoryAuditSink();
    const out = response();
    createAiGatewayHandler({mode:"mock",auditSink:audit})(request(),out.res);
    expect(audit.list()).toHaveLength(1);
    expect(audit.list()[0].inputLength).toBe("Review this TypeScript module.".length);
    expect(JSON.stringify(audit.list())).not.toContain("Review this TypeScript module.");
    expect(out.headers["cache-control"]).toBe("no-store");
    expect(out.headers["x-content-type-options"]).toBe("nosniff");
    expect(out.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  });
});
