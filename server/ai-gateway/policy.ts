import {
  privilegedCapabilities, taskCapabilities,
  type GatewayCapability, type RateLimitDecision, type RateLimiter,
} from "./contracts";

export const MAX_BODY_BYTES = 8 * 1024;
export const MAX_PROMPT_CHARS = 4_000;

export type PayloadValidation =
  | { readonly ok: true; readonly value: { readonly capability: GatewayCapability; readonly prompt: string } }
  | { readonly ok: false; readonly reason: string };

function onlyKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  return Object.keys(value).every((key) => allowed.includes(key));
}

export function parseGatewayPayload(value: unknown): PayloadValidation {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok:false, reason:"body_must_be_object" };
  const record = value as Record<string, unknown>;
  if (!onlyKeys(record, ["capability","input"])) return { ok:false, reason:"unknown_request_fields" };
  if (typeof record.capability !== "string") return { ok:false, reason:"capability_required" };

  const capability = record.capability as GatewayCapability;
  const known = [...taskCapabilities, ...privilegedCapabilities] as readonly string[];
  if (!known.includes(capability)) return { ok:false, reason:"unsupported_capability" };

  if (!record.input || typeof record.input !== "object" || Array.isArray(record.input)) return { ok:false, reason:"input_must_be_object" };
  const input = record.input as Record<string, unknown>;
  if (!onlyKeys(input, ["prompt"])) return { ok:false, reason:"unknown_input_fields" };
  if (typeof input.prompt !== "string" || input.prompt.trim().length === 0) return { ok:false, reason:"prompt_required" };
  if (input.prompt.length > MAX_PROMPT_CHARS) return { ok:false, reason:"prompt_too_long" };

  return { ok:true, value:{ capability, prompt:input.prompt.trim() } };
}

export function isTaskCapability(capability: GatewayCapability) {
  return (taskCapabilities as readonly string[]).includes(capability);
}

export function isPrivilegedCapability(capability: GatewayCapability) {
  return (privilegedCapabilities as readonly string[]).includes(capability);
}

export function createRateLimiter(options?: {
  readonly windowMs?: number; readonly maxRequests?: number; readonly now?: () => number;
}): RateLimiter {
  const windowMs = options?.windowMs ?? 60_000;
  const maxRequests = options?.maxRequests ?? 20;
  const now = options?.now ?? Date.now;
  if (!Number.isInteger(windowMs) || windowMs < 1) throw new RangeError("windowMs must be positive.");
  if (!Number.isInteger(maxRequests) || maxRequests < 1) throw new RangeError("maxRequests must be positive.");

  const buckets = new Map<string, number[]>();
  return (key): RateLimitDecision => {
    const current = now();
    const active = (buckets.get(key) ?? []).filter((stamp) => stamp > current - windowMs);
    if (active.length >= maxRequests) {
      buckets.set(key, active);
      return { allowed:false, retryAfterSeconds:Math.max(1, Math.ceil((active[0] + windowMs - current) / 1000)) };
    }
    active.push(current);
    buckets.set(key, active);
    if (buckets.size > 1000) {
      for (const [bucketKey, stamps] of buckets) {
        if (stamps.every((stamp) => stamp <= current - windowMs)) buckets.delete(bucketKey);
        if (buckets.size <= 800) break;
      }
    }
    return { allowed:true, retryAfterSeconds:0 };
  };
}
