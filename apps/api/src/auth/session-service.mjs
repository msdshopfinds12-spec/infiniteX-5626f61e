import { createCsrfToken } from "./csrf.mjs";
import { createOpaqueToken, equalTokenDigests, hashOpaqueToken } from "./opaque-token.mjs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_TTL_SECONDS = 60 * 60 * 8;

function assertUserId(userId) {
  if (typeof userId !== "string" || !UUID_PATTERN.test(userId)) {
    throw new TypeError("userId must be a valid UUID");
  }
}

function readClock(clock) {
  const now = clock();
  if (!Number.isSafeInteger(now) || now < 1) {
    throw new RangeError("clock must return a positive safe integer timestamp");
  }
  return now;
}

export function createSessionService({
  repository,
  clock = Date.now,
  ttlSeconds = DEFAULT_TTL_SECONDS,
  tokenFactory = createOpaqueToken,
  csrfFactory = createCsrfToken
}) {
  if (
    !repository ||
    typeof repository.create !== "function" ||
    typeof repository.findActiveByTokenHash !== "function" ||
    typeof repository.revokeByTokenHash !== "function"
  ) throw new TypeError("A persistent session repository is required");
  if (typeof clock !== "function" || typeof tokenFactory !== "function" || typeof csrfFactory !== "function") {
    throw new TypeError("clock, tokenFactory, and csrfFactory must be functions");
  }
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 60 || ttlSeconds > 31_536_000) {
    throw new RangeError("ttlSeconds must be between 60 seconds and one year");
  }

  return Object.freeze({
    async create({ userId }) {
      assertUserId(userId);
      const now = readClock(clock);
      const token = tokenFactory();
      const csrf = csrfFactory();
      const tokenHash = hashOpaqueToken(token);

      if (!csrf || typeof csrf.token !== "string" || typeof csrf.tokenHash !== "string" ||
          !/^[a-f0-9]{64}$/.test(csrf.tokenHash) ||
          !equalTokenDigests(hashOpaqueToken(csrf.token), csrf.tokenHash)) {
        throw new TypeError("csrfFactory returned an invalid token pair");
      }

      const expiresAtMs = now + ttlSeconds * 1000;
      if (!Number.isSafeInteger(expiresAtMs) || expiresAtMs > 8_640_000_000_000_000) {
        throw new RangeError("Session expiry is outside the supported date range");
      }
      const expiresAt = new Date(expiresAtMs).toISOString();
      await repository.create({
        userId: userId.toLowerCase(),
        tokenHash,
        csrfTokenHash: csrf.tokenHash,
        expiresAt
      });
      return Object.freeze({ token, csrfToken: csrf.token, expiresAt });
    },

    async resolve(token) {
      let tokenHash;
      try { tokenHash = hashOpaqueToken(token); } catch { return null; }
      const now = readClock(clock);
      const session = await repository.findActiveByTokenHash(tokenHash, new Date(now).toISOString());
      if (!session || session.revokedAt) return null;
      const expiresAt = Date.parse(session.expiresAt);
      if (!Number.isFinite(expiresAt) || expiresAt <= now) return null;
      if (typeof session.userId !== "string" || !UUID_PATTERN.test(session.userId)) return null;
      if (typeof session.csrfTokenHash !== "string" || !/^[a-f0-9]{64}$/.test(session.csrfTokenHash)) return null;
      return Object.freeze({
        userId: session.userId.toLowerCase(),
        active: true,
        csrfTokenHash: session.csrfTokenHash,
        expiresAt: session.expiresAt
      });
    },

    async revoke(token) {
      let tokenHash;
      try { tokenHash = hashOpaqueToken(token); } catch { return false; }
      const now = readClock(clock);
      return repository.revokeByTokenHash(tokenHash, new Date(now).toISOString());
    }
  });
}


