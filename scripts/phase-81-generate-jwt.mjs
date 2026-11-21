#!/usr/bin/env node
import { createHmac } from "node:crypto";
import { appendFile } from "node:fs/promises";

const secret = process.env.PHASE81_JWT_SECRET;
const output = process.env.GITHUB_ENV;
if (!secret || secret.length < 32) throw new Error("PHASE81_JWT_SECRET must be an ephemeral secret of at least 32 characters.");
if (!output) throw new Error("GITHUB_ENV is required; refusing to write tokens to stdout.");

const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
function sign(payload) {
  const input = encode({ alg: "HS256", typ: "JWT" }) + "." + encode(payload);
  const signature = createHmac("sha256", secret).update(input).digest("base64url");
  return input + "." + signature;
}
const now = Math.floor(Date.now() / 1000);
const exp = now + 1800;
const userId = "81000000-0000-4000-8000-000000000001";
const userBId = "81000000-0000-4000-8000-000000000002";
const userToken = sign({ aud: "authenticated", role: "authenticated", sub: userId, iat: now, exp });
const userBToken = sign({ aud: "authenticated", role: "authenticated", sub: userBId, iat: now, exp });
const serviceToken = sign({ aud: "authenticated", role: "service_role", iat: now, exp });
await appendFile(output, [
  "PHASE81_USER_JWT=" + userToken,
  "PHASE81_USER_B_JWT=" + userBToken,
  "PHASE81_USER_B_ID=" + userBId,
  "PHASE81_SERVICE_JWT=" + serviceToken,
  "PHASE81_USER_ID=" + userId,
  "PHASE81_RUN_ID=81000000-3000-4000-8000-000000000001",
  "",
].join("\n"));
console.log("Generated short-lived synthetic JWTs for disposable local PostgREST only.");
