import test from "node:test";
import assert from "node:assert/strict";
import {
  createOpaqueToken, hashOpaqueToken, equalTokenDigests
} from "../src/auth/opaque-token.mjs";
import { createCsrfToken, verifyCsrfToken, isTrustedMutationOrigin } from "../src/auth/csrf.mjs";
import {
  serializeSessionCookie, serializeExpiredSessionCookie, readSessionCookie
} from "../src/auth/cookie-policy.mjs";
import { createSessionService } from "../src/auth/session-service.mjs";
import { authorizeWorkspaceAction, authorizeWorkspaceRoleChange } from "../src/authorization/policy.mjs";

const USER_ID = "2d931510-d99f-494a-8c67-87feb05e1594";
const WORKSPACE_ID = "f2c5a4e1-91d7-4b3c-a8c7-8e4b51a5e111";

test("opaque token is high entropy, URL-safe, and stored as a digest", () => {
  const token = createOpaqueToken();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  const digest = hashOpaqueToken(token);
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.notEqual(digest, token);
  assert.equal(equalTokenDigests(digest, hashOpaqueToken(token)), true);
  assert.equal(equalTokenDigests(digest, "x".repeat(64)), false);
});

test("opaque token parser rejects malformed and non-canonical values", () => {
  for (const value of ["", "short", "x".repeat(43), "a".repeat(44), null]) {
    assert.throws(() => hashOpaqueToken(value));
  }
});

test("CSRF token validates only against its own digest", () => {
  const csrf = createCsrfToken();
  assert.equal(verifyCsrfToken({ token: csrf.token, expectedTokenHash: csrf.tokenHash }), true);
  assert.equal(verifyCsrfToken({ token: createOpaqueToken(), expectedTokenHash: csrf.tokenHash }), false);
  assert.equal(verifyCsrfToken({ token: "bad", expectedTokenHash: csrf.tokenHash }), false);
});

test("mutation origin check requires an exact configured origin", () => {
  const allowedOrigins = ["https://app.example.test"];
  assert.equal(isTrustedMutationOrigin({ origin: "https://app.example.test", allowedOrigins }), true);
  assert.equal(isTrustedMutationOrigin({ origin: "https://evil.example", allowedOrigins }), false);
  assert.equal(isTrustedMutationOrigin({ origin: undefined, allowedOrigins }), false);
});

test("session cookie is Secure, HttpOnly, host-prefixed, and path-bound", () => {
  const token = createOpaqueToken();
  const cookie = serializeSessionCookie({ value: token, maxAgeSeconds: 3600 });
  assert.match(cookie, /^__Host-infinite_x_session=/);
  assert.match(cookie, /Path=\//);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/);
  assert.equal(readSessionCookie(cookie.split(";")[0]), token);
  assert.equal(readSessionCookie(cookie.split(";")[0] + "; __Host-infinite_x_session=" + token), null);
});

test("cookie policy rejects insecure, invalid, or unbounded cookie values", () => {
  assert.throws(() => serializeSessionCookie({ name: "session", value: createOpaqueToken(), maxAgeSeconds: 60 }));
  assert.throws(() => serializeSessionCookie({ value: "bad", maxAgeSeconds: 60 }));
  assert.throws(() => serializeSessionCookie({ value: "x".repeat(43), maxAgeSeconds: 60 }));
  assert.equal(readSessionCookie("__Host-infinite_x_session=" + "x".repeat(43)), null);
  assert.throws(() => serializeSessionCookie({ value: createOpaqueToken(), maxAgeSeconds: -1 }));
  assert.throws(() => serializeSessionCookie({ value: createOpaqueToken(), maxAgeSeconds: 60, sameSite: "None" }));
  assert.match(serializeExpiredSessionCookie(), /Max-Age=0/);
});

test("session service creates hashed sessions, resolves active sessions, and revokes them", async () => {
  let now = 1_700_000_000_000;
  const records = new Map();
  const repository = {
    async create(record) { records.set(record.tokenHash, { ...record, revokedAt: null }); },
    async findActiveByTokenHash(hash) { return records.get(hash) ?? null; },
    async revokeByTokenHash(hash, revokedAt) {
      const record = records.get(hash);
      if (!record || record.revokedAt) return false;
      record.revokedAt = revokedAt;
      return true;
    }
  };
  const service = createSessionService({ repository, clock: () => now });
  const issued = await service.create({ userId: USER_ID });
  const digest = hashOpaqueToken(issued.token);
  assert.equal(records.has(digest), true);
  assert.equal(records.get(digest).tokenHash, digest);
  assert.equal(records.get(digest).tokenHash.includes(issued.token), false);
  assert.equal((await service.resolve(issued.token)).userId, USER_ID);
  assert.equal(await service.revoke(issued.token), true);
  assert.equal(await service.resolve(issued.token), null);
});

test("session service rejects malformed identities and invalid sessions", async () => {
  const repository = {
    async create() {},
    async findActiveByTokenHash() { return null; },
    async revokeByTokenHash() { return false; }
  };
  const service = createSessionService({ repository, clock: () => 1_700_000_000_000 });
  await assert.rejects(() => service.create({ userId: "not-a-uuid" }));
  assert.equal(await service.resolve("not-a-token"), null);
  assert.equal(await service.revoke("not-a-token"), false);
});

test("expired session is not resolved", async () => {
  let now = 1_700_000_000_000;
  const records = new Map();
  const repository = {
    async create(record) { records.set(record.tokenHash, record); },
    async findActiveByTokenHash(hash) { return records.get(hash) ?? null; },
    async revokeByTokenHash() { return false; }
  };
  const service = createSessionService({ repository, clock: () => now, ttlSeconds: 60 });
  const issued = await service.create({ userId: USER_ID });
  now += 60_000;
  assert.equal(await service.resolve(issued.token), null);
});

const principal = { userId: USER_ID, active: true };
const membership = { userId: USER_ID, workspaceId: WORKSPACE_ID, role: "member", status: "active" };

test("workspace policy allows active members only within their own workspace", () => {
  assert.equal(authorizeWorkspaceAction({
    principal, membership, workspaceId: WORKSPACE_ID, permission: "content:read"
  }).allowed, true);
  assert.equal(authorizeWorkspaceAction({
    principal, membership, workspaceId: "another-workspace", permission: "content:read"
  }).allowed, false);
});

test("workspace policy denies inactive principals, unknown roles, and viewer writes", () => {
  assert.equal(authorizeWorkspaceAction({
    principal: { ...principal, active: false }, membership,
    workspaceId: WORKSPACE_ID, permission: "content:read"
  }).allowed, false);
  assert.equal(authorizeWorkspaceAction({
    principal, membership: { ...membership, role: "superadmin" },
    workspaceId: WORKSPACE_ID, permission: "content:read"
  }).allowed, false);
  assert.equal(authorizeWorkspaceAction({
    principal, membership: { ...membership, role: "viewer" },
    workspaceId: WORKSPACE_ID, permission: "content:create"
  }).allowed, false);
});

test("own-resource permissions enforce ownership", () => {
  assert.equal(authorizeWorkspaceAction({
    principal, membership, workspaceId: WORKSPACE_ID,
    permission: "content:update:own", resourceOwnerId: USER_ID
  }).allowed, true);
  assert.equal(authorizeWorkspaceAction({
    principal, membership, workspaceId: WORKSPACE_ID,
    permission: "content:update:own", resourceOwnerId: "other-user"
  }).allowed, false);
});

test("role policy protects last active owner and reserves ownership transfer", () => {
  const owner = { userId: USER_ID, workspaceId: WORKSPACE_ID, role: "owner", status: "active" };
  const target = { userId: "another-user", workspaceId: WORKSPACE_ID, role: "owner", status: "active" };
  assert.equal(authorizeWorkspaceRoleChange({
    actorMembership: owner, targetMembership: target, newRole: "member", activeOwnerCount: 1
  }).reason, "LAST_OWNER_INVARIANT");
  assert.equal(authorizeWorkspaceRoleChange({
    actorMembership: owner, targetMembership: target, newRole: "owner", activeOwnerCount: 2
  }).reason, "USE_EXPLICIT_OWNERSHIP_TRANSFER");
});

test("session service rejects timestamps outside the supported Date range", async () => {
  const repository = {
    async create() {},
    async findActiveByTokenHash() { return null; },
    async revokeByTokenHash() { return false; }
  };
  const service = createSessionService({
    repository,
    clock: () => 8_640_000_000_000_000,
    ttlSeconds: 60
  });
  await assert.rejects(() => service.create({ userId: USER_ID }), /supported date range/);
});
