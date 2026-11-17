import test from "node:test";
import assert from "node:assert/strict";
import { createPostgresSessionRepository } from "../src/auth/postgres-session-repository.mjs";

const USER_ID = "2d931510-d99f-494a-8c67-87feb05e1594";
const TOKEN_HASH = "a".repeat(64);
const CSRF_HASH = "b".repeat(64);
const NOW = "2030-01-01T00:00:00.000Z";
const EXPIRY = "2030-01-01T01:00:00.000Z";

test("PostgreSQL session repository uses parameterized INSERT values", async () => {
  const calls = [];
  const repository = createPostgresSessionRepository({
    pool: { async query(sql, values) { calls.push({ sql, values }); return { rowCount: 1, rows: [] }; } }
  });
  await repository.create({
    userId: USER_ID, tokenHash: TOKEN_HASH,
    csrfTokenHash: CSRF_HASH, expiresAt: EXPIRY
  });
  assert.match(calls[0].sql, /INSERT INTO auth_sessions/);
  assert.match(calls[0].sql, /\$1::uuid/);
  assert.deepEqual(calls[0].values, [USER_ID, TOKEN_HASH, CSRF_HASH, EXPIRY]);
  assert.equal(calls[0].sql.includes(TOKEN_HASH), false);
});

test("PostgreSQL session lookup returns only active unexpired session fields", async () => {
  const expected = {
    userId: USER_ID, csrfTokenHash: CSRF_HASH,
    expiresAt: new Date(EXPIRY), revokedAt: null
  };
  const calls = [];
  const repository = createPostgresSessionRepository({
    pool: { async query(sql, values) { calls.push({ sql, values }); return { rows: [expected] }; } }
  });
  const result = await repository.findActiveByTokenHash(TOKEN_HASH, NOW);
  assert.deepEqual(result, expected);
  assert.match(calls[0].sql, /revoked_at IS NULL/);
  assert.match(calls[0].sql, /expires_at > \$2::timestamptz/);
  assert.deepEqual(calls[0].values, [TOKEN_HASH, NOW]);
});

test("PostgreSQL session revocation is conditional and idempotent", async () => {
  const calls = [];
  const repository = createPostgresSessionRepository({
    pool: { async query(sql, values) { calls.push({ sql, values }); return { rowCount: 1, rows: [] }; } }
  });
  assert.equal(await repository.revokeByTokenHash(TOKEN_HASH, NOW), true);
  assert.match(calls[0].sql, /revoked_at IS NULL/);
  assert.match(calls[0].sql, /expires_at > \$2::timestamptz/);
  assert.deepEqual(calls[0].values, [TOKEN_HASH, NOW]);
});

test("PostgreSQL repository rejects invalid inputs before database access", async () => {
  let calls = 0;
  const repository = createPostgresSessionRepository({
    pool: { async query() { calls += 1; return { rowCount: 0, rows: [] }; } }
  });
  await assert.rejects(() => repository.create({
    userId: "invalid", tokenHash: TOKEN_HASH,
    csrfTokenHash: CSRF_HASH, expiresAt: EXPIRY
  }), /UUID/);
  await assert.rejects(() => repository.findActiveByTokenHash("bad", NOW), /digest/);
  await assert.rejects(() => repository.revokeByTokenHash(TOKEN_HASH, "bad-date"), /timestamp/);
  assert.equal(calls, 0);
});

test("PostgreSQL repository requires a query-capable injected client", () => {
  assert.throws(() => createPostgresSessionRepository({ pool: {} }), /query client/);
});
