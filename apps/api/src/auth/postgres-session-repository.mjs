/**
 * PostgreSQL session repository adapter.
 *
 * Inject a trusted pg-compatible pool/client. This module does not create
 * connections, read environment variables, or execute schema migrations.
 * Required table contract: auth_sessions(user_id, token_hash, csrf_token_hash,
 * expires_at, revoked_at, created_at).
 */
const REQUIRED_QUERY_METHODS = ["query"];

function assertQueryable(pool) {
  if (!pool || REQUIRED_QUERY_METHODS.some((method) => typeof pool[method] !== "function")) {
    throw new TypeError("A pg-compatible query client is required");
  }
}

function assertDigest(value, name) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw new TypeError(name + " must be a SHA-256 hex digest");
  }
}

function assertUserId(value) {
  if (typeof value !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new TypeError("userId must be a valid UUID");
  }
}

export function createPostgresSessionRepository({ pool }) {
  assertQueryable(pool);

  return Object.freeze({
    async create({ userId, tokenHash, csrfTokenHash, expiresAt }) {
      assertUserId(userId);
      assertDigest(tokenHash, "tokenHash");
      assertDigest(csrfTokenHash, "csrfTokenHash");
      if (typeof expiresAt !== "string" || !Number.isFinite(Date.parse(expiresAt))) {
        throw new TypeError("expiresAt must be a valid timestamp");
      }

      await pool.query(
        `INSERT INTO auth_sessions
          (user_id, token_hash, csrf_token_hash, expires_at, created_at)
         VALUES ($1::uuid, $2, $3, $4::timestamptz, NOW())`,
        [userId, tokenHash, csrfTokenHash, expiresAt]
      );
    },

    async findActiveByTokenHash(tokenHash, nowIso) {
      assertDigest(tokenHash, "tokenHash");
      if (typeof nowIso !== "string" || !Number.isFinite(Date.parse(nowIso))) {
        throw new TypeError("nowIso must be a valid timestamp");
      }

      const result = await pool.query(
        `SELECT user_id::text AS "userId",
                csrf_token_hash AS "csrfTokenHash",
                expires_at AS "expiresAt",
                revoked_at AS "revokedAt"
           FROM auth_sessions
          WHERE token_hash = $1
            AND revoked_at IS NULL
            AND expires_at > $2::timestamptz
          LIMIT 1`,
        [tokenHash, nowIso]
      );
      return result.rows?.[0] ?? null;
    },

    async revokeByTokenHash(tokenHash, revokedAtIso) {
      assertDigest(tokenHash, "tokenHash");
      if (typeof revokedAtIso !== "string" || !Number.isFinite(Date.parse(revokedAtIso))) {
        throw new TypeError("revokedAtIso must be a valid timestamp");
      }

      const result = await pool.query(
        `UPDATE auth_sessions
            SET revoked_at = $2::timestamptz
          WHERE token_hash = $1
            AND revoked_at IS NULL
            AND expires_at > $2::timestamptz`,
        [tokenHash, revokedAtIso]
      );
      return result.rowCount === 1;
    }
  });
}
