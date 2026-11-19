import test from "node:test";
import assert from "node:assert/strict";
import {
  ApprovalAuthorityError,
  createApprovalAuthority,
} from "../server/ai/approval-authority.mjs";

const binding = {
  principal: { subject: "user-123" },
  taskId: "task-42",
  action: "execute",
  capabilityId: "text.metrics",
  capabilityVersion: "1.0.0",
  taskVersion: "3",
  agentId: "local-helper",
  agentVersion: "2.1.0",
  payloadHash: "a".repeat(64),
};

function setup({ ttlMs = 5_000, maxRecords = 10, initialTime = 10_000 } = {}) {
  let time = initialTime;
  let sequence = 0;
  const authority = createApprovalAuthority({
    ttlMs,
    maxRecords,
    now: () => time,
    tokenFactory: () => "test_token_" + String(++sequence).padStart(40, "0"),
  });
  return { authority, setTime: (value) => { time = value; } };
}

test("issues an opaque, short-lived grant and consumes it exactly once", () => {
  const { authority } = setup();
  const grant = authority.issue(binding);
  assert.equal(typeof grant.token, "string");
  assert.equal(grant.expiresAt, 15_000);
  assert.equal(authority.consume({ ...binding, token: grant.token }), true);
  assert.equal(authority.consume({ ...binding, token: grant.token }), false);
  assert.deepEqual(authority.getStats(), { pending: 0, maxRecords: 10 });
});

test("rejects forged, unknown, and malformed approval tokens", () => {
  const { authority } = setup();
  assert.equal(authority.consume({ ...binding, token: "forged" }), false);
  assert.equal(authority.consume({ ...binding, token: "x".repeat(40) }), false);
});

test("rejects grants bound to another principal, task, action, capability, or version", () => {
  const { authority } = setup();
  const grant = authority.issue(binding);
  const attempts = [
    { ...binding, principal: { subject: "other-user" } },
    { ...binding, taskId: "other-task" },
    { ...binding, action: "delete" },
    { ...binding, capabilityId: "task.preview" },
    { ...binding, capabilityVersion: "2.0.0" },
    { ...binding, taskVersion: "4" },
    { ...binding, agentId: "other-agent" },
    { ...binding, agentVersion: "3.0.0" },
    { ...binding, payloadHash: "b".repeat(64) },
  ];
  for (const attempt of attempts) {
    assert.equal(authority.consume({ ...attempt, token: grant.token }), false);
  }
  assert.equal(authority.consume({ ...binding, token: grant.token }), true);
});

test("rejects expired grants and prunes them from the in-memory store", () => {
  const { authority, setTime } = setup({ ttlMs: 1_000 });
  const grant = authority.issue(binding);
  setTime(11_000);
  assert.equal(authority.consume({ ...binding, token: grant.token }), false);
  assert.equal(authority.getStats().pending, 0);
});

test("does not evict live grants when capacity is reached", () => {
  const { authority } = setup({ maxRecords: 1 });
  const first = authority.issue(binding);
  assert.throws(() => authority.issue({ ...binding, taskId: "task-43" }), (error) =>
    error instanceof ApprovalAuthorityError && error.code === "APPROVAL_CAPACITY_REACHED");
  assert.equal(authority.consume({ ...binding, token: first.token }), true);
});

test("rejects invalid trusted-principal input and invalid token sources", () => {
  const { authority } = setup();
  assert.throws(() => authority.issue({ ...binding, principal: null }), (error) =>
    error instanceof ApprovalAuthorityError && error.code === "INVALID_PRINCIPAL_SUBJECT");

  const bad = createApprovalAuthority({ tokenFactory: () => "short" });
  assert.throws(() => bad.issue(binding), (error) =>
    error instanceof ApprovalAuthorityError && error.code === "INVALID_TOKEN_SOURCE");
});

test("rejects a non-monotonic or invalid approval clock", () => {
  const authority = createApprovalAuthority({ now: () => Number.NaN });
  assert.throws(() => authority.issue(binding), (error) =>
    error instanceof ApprovalAuthorityError && error.code === "INVALID_CLOCK");
});
