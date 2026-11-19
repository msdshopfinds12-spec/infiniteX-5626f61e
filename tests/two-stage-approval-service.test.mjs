import test from "node:test";
import assert from "node:assert/strict";
import { createApprovalProtocolAdapter } from "../server/ai/approval-protocol-adapter.mjs";
import {
  createTwoStageApprovalService,
  createHmacApprovalTokenFactory,
  TwoStageApprovalError,
} from "../server/ai/two-stage-approval-service.mjs";

const principal = Object.freeze({ authContext: "verified-principal" });
const worker = Object.freeze({ authContext: "verified-worker" });
const token = "A".repeat(43);
const task = (status = "awaiting_approval") => ({
  taskId: "task-42",
  status,
  taskVersion: "v7",
  agentId: "agent-safe",
  agentVersion: "1.2.0",
  capabilityId: "text.summarize",
  capabilityVersion: "2.0.0",
  input: { text: "synthetic test input", options: { concise: true } },
});
const expiresAt = "2026-11-21T00:00:00.000Z";

function fixture({ allowed = true } = {}) {
  let currentTask = task();
  let grantRequest;
  let grantResult;
  let claimRequest;
  const protocolAdapter = createApprovalProtocolAdapter({
    store: {
      async issueApprovalGrantV1(request) {
        if (grantRequest) {
          if (request.idempotencyKey === grantRequest.idempotencyKey &&
              request.approvalTokenDigest === grantRequest.approvalTokenDigest) {
            return { ...grantResult, outcome: "already_issued" };
          }
          return { outcome: "conflict" };
        }
        grantRequest = request;
        currentTask = task("approved");
        grantResult = { outcome: "issued", task: currentTask, expiresAt };
        return grantResult;
      },
      async claimApprovedTaskV1(request) {
        claimRequest = request;
        return {
          outcome: "claimed",
          task: { id: request.taskId, status: "running", version: 9 },
          lease: {
            leaseId: "lease-42",
            workerSubject: "worker-verified",
            fencingToken: 1,
            expiresAt: "2026-11-20T12:01:00.000Z",
          },
        };
      },
    },
    resolvePrincipalSubject(identity) {
      if (identity !== principal) throw new Error("untrusted");
      return "principal-verified";
    },
    resolveWorkerSubject(identity) {
      if (identity !== worker) throw new Error("untrusted");
      return "worker-verified";
    },
  });
  const service = createTwoStageApprovalService({
    protocolAdapter,
    loadTaskSnapshot: async () => currentTask,
    authorizeApproval: async () => allowed,
    tokenFactory: () => token,
    ttlMs: 60_000,
  });
  return { service, getGrantRequest: () => grantRequest, getClaimRequest: () => claimRequest };
}

test("approval persists only the digest and returns the raw grant once", async () => {
  const f = fixture();
  const result = await f.service.approveTaskV1({
    principal, taskId: "task-42", idempotencyKey: "approve-42",
  });
  assert.equal(result.outcome, "issued");
  assert.equal(result.task.status, "approved");
  assert.equal(result.approvalToken, token);
  assert.equal(f.getGrantRequest().principalSubject, "principal-verified");
  assert.match(f.getGrantRequest().approvalTokenDigest, /^[a-f0-9]{64}$/u);
  assert.notEqual(f.getGrantRequest().approvalTokenDigest, token);
  assert.equal("approvalToken" in f.getGrantRequest(), false);
  assert.equal(f.getGrantRequest().idempotencyKey, "approve-42");
  assert.equal(Object.isFrozen(f.getGrantRequest()), true);
});

test("approval retry returns the same token and original expiry for the same idempotency request", async () => {
  const f = fixture();
  const first = await f.service.approveTaskV1({
    principal, taskId: "task-42", idempotencyKey: "approve-replay-42",
  });
  const replay = await f.service.approveTaskV1({
    principal, taskId: "task-42", idempotencyKey: "approve-replay-42",
  });
  assert.equal(first.outcome, "issued");
  assert.equal(replay.outcome, "already_issued");
  assert.equal(replay.approvalToken, first.approvalToken);
  assert.equal(replay.expiresAt, first.expiresAt);
});

test("HMAC approval tokens are deterministic and scoped to principal, task, payload, and key", () => {
  const factory = createHmacApprovalTokenFactory({
    secret: "test-only-secret-material-at-least-32-bytes",
    resolvePrincipalSubject: (identity) => identity === principal ? "principal-verified" : "other-principal",
  });
  const input = {
    principal, taskId: "task-42", idempotencyKey: "approve-42",
    payloadHash: "b".repeat(64),
  };
  const first = factory(input);
  assert.equal(factory(input), first);
  assert.notEqual(factory({ ...input, idempotencyKey: "approve-43" }), first);
  assert.notEqual(factory({ ...input, taskId: "task-43" }), first);
  assert.notEqual(factory({ ...input, payloadHash: "c".repeat(64) }), first);
  assert.notEqual(factory({ ...input, principal: Object.freeze({ authContext: "other" }) }), first);
  assert.match(first, /^[A-Za-z0-9_-]{43}$/u);
  assert.throws(() => createHmacApprovalTokenFactory({
    secret: "too-short",
    resolvePrincipalSubject: () => "principal-verified",
  }), TypeError);
});

test("worker claim binds the one-time token digest and trusted identities", async () => {
  const f = fixture();
  const approved = await f.service.approveTaskV1({
    principal, taskId: "task-42", idempotencyKey: "approve-42",
  });
  const claimed = await f.service.claimApprovedTaskV1({
    principal, worker, taskId: "task-42", approvalToken: approved.approvalToken,
    idempotencyKey: "claim-42", leaseDurationMs: 60_000,
  });
  assert.equal(claimed.outcome, "claimed");
  assert.equal(f.getClaimRequest().workerSubject, "worker-verified");
  assert.equal(f.getClaimRequest().principalSubject, "principal-verified");
  assert.equal(f.getClaimRequest().approvalTokenDigest, f.getGrantRequest().approvalTokenDigest);
  assert.equal("approvalToken" in f.getClaimRequest(), false);
});

test("denies approval before issuing or persisting a grant", async () => {
  const f = fixture({ allowed: false });
  await assert.rejects(
    f.service.approveTaskV1({ principal, taskId: "task-42", idempotencyKey: "deny-42" }),
    (error) => error instanceof TwoStageApprovalError && error.code === "APPROVAL_FORBIDDEN",
  );
  assert.equal(f.getGrantRequest(), undefined);
});

test("rejects untrusted principal and malformed token before store calls", async () => {
  const f = fixture();
  await assert.rejects(
    f.service.approveTaskV1({
      principal: { authContext: "forged" }, taskId: "task-42", idempotencyKey: "spoof-42",
    }),
    (error) => error.code === "UNTRUSTED_PRINCIPAL",
  );
  await assert.rejects(
    f.service.claimApprovedTaskV1({
      principal, worker, taskId: "task-42", approvalToken: "invalid",
      idempotencyKey: "bad-token", leaseDurationMs: 60_000,
    }),
    (error) => error.code === "INVALID_APPROVAL_TOKEN",
  );
  assert.equal(f.getGrantRequest(), undefined);
  assert.equal(f.getClaimRequest(), undefined);
});

test("a different idempotency key cannot issue a second grant for an already approved task", async () => {
  const f = fixture();
  const first = await f.service.approveTaskV1({
    principal, taskId: "task-42", idempotencyKey: "approve-42",
  });
  const second = await f.service.approveTaskV1({
    principal, taskId: "task-42", idempotencyKey: "approve-again",
  });
  assert.equal(first.outcome, "issued");
  assert.deepEqual(second, { outcome: "conflict" });
});
