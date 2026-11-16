import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TXID_PATTERN = /^[1-9][0-9]{0,19}$/;
const KID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
const DEFAULT_TTL_SECONDS = 20;

function requiredString(value, name, maxLength = 255) {
  if (typeof value !== "string" || value.length < 1 || value.length > maxLength || value.trim() !== value) {
    throw new TypeError(name + " is invalid");
  }
  return value;
}

function decodeSecret(secretHex) {
  if (typeof secretHex !== "string" || !/^(?:[0-9a-f]{2}){32,}$/.test(secretHex)) {
    throw new TypeError("IDENTITY_HMAC_SECRET_HEX must be at least 32 bytes encoded as lowercase or uppercase hex");
  }
  return Buffer.from(secretHex, "hex");
}

/**
 * Creates a database-verifiable assertion signer.
 *
 * Call only after the HTTP/authentication boundary has validated the principal.
 * The database independently verifies the HMAC, database role, expiry and
 * transaction ID. This module is not an authentication provider.
 */
export function createIdentityAssertionSigner({
  secretHex,
  keyId,
  issuer = "https://identity.infinite-x.invalid",
  audience = "infinite-x-api",
  databaseRole,
  ttlSeconds = DEFAULT_TTL_SECONDS,
  clock = Date.now,
  idFactory = randomUUID,
}) {
  const secret = decodeSecret(secretHex);
  const kid = requiredString(keyId, "keyId", 64);
  if (!KID_PATTERN.test(kid)) throw new TypeError("keyId contains unsupported characters");
  const iss = requiredString(issuer, "issuer", 2048);
  const aud = requiredString(audience, "audience", 128);
  const dbRole = requiredString(databaseRole, "databaseRole", 63);

  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > DEFAULT_TTL_SECONDS) {
    throw new RangeError("ttlSeconds must be between 1 and 20");
  }
  if (typeof clock !== "function" || typeof idFactory !== "function") {
    throw new TypeError("clock and idFactory must be functions");
  }

  return Object.freeze({
    sign({ userId, workspaceId, transactionId, requestId }) {
      if (typeof userId !== "string" || !UUID_PATTERN.test(userId)) {
        throw new TypeError("userId must be a valid UUID");
      }
      if (typeof workspaceId !== "string" || !UUID_PATTERN.test(workspaceId)) {
        throw new TypeError("workspaceId must be a valid UUID");
      }
      if (typeof transactionId !== "string" || !TXID_PATTERN.test(transactionId)) {
        throw new TypeError("transactionId must be a positive PostgreSQL transaction ID");
      }
      const jti = idFactory();
      if (typeof jti !== "string" || !UUID_PATTERN.test(jti)) {
        throw new TypeError("idFactory must return a UUID");
      }
      const now = Math.floor(clock() / 1000);
      if (!Number.isSafeInteger(now) || now < 1) throw new RangeError("clock returned an invalid time");
      const claims = {
        v: 1,
        iss,
        sub: userId.toLowerCase(),
        workspace_id: workspaceId.toLowerCase(),
        aud,
        db_role: dbRole,
        txid: transactionId,
        iat: now,
        exp: now + ttlSeconds,
        jti,
        kid,
      };
      const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("hex");
      const signature = createHmac("sha256", secret).update(payload, "utf8").digest("hex");
      // requestId is deliberately not embedded: audit correlation IDs are not identity claims.
      void requestId;
      return payload + "." + signature;
    },
  });
}

export function verifyAssertionSignatureForTests(token, secretHex) {
  if (typeof token !== "string" || token.length > 20_000) return false;
  const parts = token.split(".");
  if (parts.length !== 2 || !/^(?:[0-9a-f]{2})+$/.test(parts[0]) || !/^[0-9a-f]{64}$/.test(parts[1])) {
    return false;
  }
  const expected = createHmac("sha256", decodeSecret(secretHex)).update(parts[0], "utf8").digest();
  const actual = Buffer.from(parts[1], "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
