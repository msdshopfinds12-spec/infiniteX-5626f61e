import test from "node:test";
import assert from "node:assert/strict";
import { createSessionService } from "../src/auth/session-service.mjs";
import { createOpaqueToken, hashOpaqueToken } from "../src/auth/opaque-token.mjs";
import { createCsrfToken } from "../src/auth/csrf.mjs";

const userId = "123e4567-e89b-42d3-a456-426614174000";

function createTestRepository() {
  const sessions = new Map();
  return {
    sessions,
    async create(record) {
      if (sessions.has(record.tokenHash)) throw new Error("duplicate session");
      sessions.set(record.tokenHash, { ...record, revokedAt: null });
    },
    async findActiveByTokenHash(tokenHash) {
      const row = sessions.get(tokenHash);
      return row && !row.revokedAt ? { ...row } : null;
    },
    async revokeByTokenHash(tokenHash, revokedAt) {
      const row = sessions.get(tokenHash);
      if (!row || row.revokedAt) return false;
      row.revokedAt = revokedAt;
      return true;
    },
  };
}

test("session service persists only token digests and returns raw token once", async () => {
  const repository = createTestRepository();
  const service = createSessionService({ repository });
  const created = await service.create({ userId });
  const digest = hashOpaqueToken(created.token);
  const stored = repository.sessions.get(digest);

  assert.ok(stored);
  assert.equal(stored.userId, userId);
  assert.equal(stored.tokenHash, digest);
  assert.notEqual(stored.tokenHash, created.token);
  assert.equal(stored.csrfTokenHash, hashOpaqueToken(created.csrfToken));
});

test("session resolution returns an active principal and logout revokes it", async () => {
  const repository = createTestRepository();
  const service = createSessionService({ repository });
  const created = await service.create({ userId });

  const principal = await service.resolve(created.token);
  assert.equal(principal.userId, userId);
  assert.equal(principal.active, true);

  assert.equal(await service.revoke(created.token), true);
  assert.equal(await service.resolve(created.token), null);
});

test("session service rejects invalid identity and missing persistent adapter", async () => {
  assert.throws(() => createSessionService({ repository: {} }), /persistent session repository/);
  const service = createSessionService({ repository: createTestRepository() });
  await assert.rejects(service.create({ userId: "not-a-uuid" }), /valid UUID/);
  assert.equal(await service.resolve("invalid"), null);
});

test("session expiry is enforced by the service", async () => {
  const repository = createTestRepository();
  let now = 1_800_000_000_000;
  const service = createSessionService({
    repository,
    clock: () => now,
    ttlSeconds: 60,
    tokenFactory: createOpaqueToken,
    csrfFactory: createCsrfToken,
  });
  const created = await service.create({ userId });
  now += 61_000;
  assert.equal(await service.resolve(created.token), null);
});
