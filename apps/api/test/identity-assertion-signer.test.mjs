import test from "node:test";
import assert from "node:assert/strict";
import { createIdentityAssertionSigner, verifyAssertionSignatureForTests } from "../src/identity/assertion-signer.mjs";

const secretHex = "a".repeat(64);
const userId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function signer(overrides = {}) {
  return createIdentityAssertionSigner({
    secretHex,
    keyId: "ci-key-1",
    databaseRole: "infinite_x_app_runtime_ci",
    clock: () => 1_800_000_000_000,
    idFactory: () => "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    ...overrides,
  });
}

test("signs a canonical transaction-bound assertion with a verifiable HMAC", () => {
  const token = signer().sign({ userId, workspaceId, transactionId: "8123", requestId: "request-1" });
  assert.match(token, /^[0-9a-f]+\.[0-9a-f]{64}$/);
  assert.equal(verifyAssertionSignatureForTests(token, secretHex), true);
  const [payloadHex] = token.split(".");
  const claims = JSON.parse(Buffer.from(payloadHex, "hex").toString("utf8"));
  assert.deepEqual(claims, {
    v: 1,
    iss: "https://identity.infinite-x.invalid",
    sub: userId,
    workspace_id: workspaceId,
    aud: "infinite-x-api",
    db_role: "infinite_x_app_runtime_ci",
    txid: "8123",
    iat: 1_800_000_000,
    exp: 1_800_000_020,
    jti: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    kid: "ci-key-1",
  });
});

test("signature verification rejects a modified payload", () => {
  const token = signer().sign({ userId, workspaceId, transactionId: "8123" });
  const [payload, signature] = token.split(".");
  const changed = payload.slice(0, -2) + "00";
  assert.equal(verifyAssertionSignatureForTests(changed + "." + signature, secretHex), false);
});

test("signature verification rejects a modified signature", () => {
  const token = signer().sign({ userId, workspaceId, transactionId: "8123" });
  const [payload, signature] = token.split(".");
  const changed = (signature[0] === "0" ? "1" : "0") + signature.slice(1);
  assert.equal(verifyAssertionSignatureForTests(payload + "." + changed, secretHex), false);
});

test("rejects malformed secrets, key IDs and TTLs at construction", () => {
  assert.throws(() => signer({ secretHex: "short" }), /at least 32 bytes/);
  assert.throws(() => signer({ keyId: "invalid key" }), /unsupported characters/);
  assert.throws(() => signer({ ttlSeconds: 21 }), /between 1 and 20/);
});

test("rejects invalid user, workspace and transaction claims", () => {
  const sign = signer().sign;
  assert.throws(() => sign({ userId: "not-a-uuid", workspaceId, transactionId: "1" }), /userId/);
  assert.throws(() => sign({ userId, workspaceId: "not-a-uuid", transactionId: "1" }), /workspaceId/);
  assert.throws(() => sign({ userId, workspaceId, transactionId: "0" }), /transactionId/);
  assert.throws(() => sign({ userId, workspaceId, transactionId: "1; SELECT 1" }), /transactionId/);
});

test("rejects invalid generated assertion IDs", () => {
  assert.throws(
    () => signer({ idFactory: () => "not-a-uuid" }).sign({ userId, workspaceId, transactionId: "8123" }),
    /idFactory/,
  );
});

test("verifier helper fails closed on malformed and oversized tokens", () => {
  assert.equal(verifyAssertionSignatureForTests("", secretHex), false);
  assert.equal(verifyAssertionSignatureForTests("abc.def", secretHex), false);
  assert.equal(verifyAssertionSignatureForTests("a".repeat(20_001), secretHex), false);
});
