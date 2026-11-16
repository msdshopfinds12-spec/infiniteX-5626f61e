import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;

export function createOpaqueToken() {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function hashOpaqueToken(token) {
  if (typeof token !== "string" || !TOKEN_PATTERN.test(token)) {
    throw new TypeError("Opaque token is invalid");
  }

  const decoded = Buffer.from(token, "base64url");
  if (decoded.length !== TOKEN_BYTES || decoded.toString("base64url") !== token) {
    throw new TypeError("Opaque token is invalid");
  }

  return createHash("sha256").update(decoded).digest("hex");
}

export function equalTokenDigests(left, right) {
  if (
    typeof left !== "string" ||
    typeof right !== "string" ||
    !DIGEST_PATTERN.test(left) ||
    !DIGEST_PATTERN.test(right)
  ) {
    return false;
  }

  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}
