/**
 * Deterministic in-memory contract fake for tests only.
 * This is NOT a production database driver and does not prove SQL concurrency.
 */
function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function stableJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(stableJson).join(",") + "]";
  return "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + stableJson(value[key])).join(",") + "}";
}

function fingerprint(value) {
  return stableJson(value);
}

export function createFakeTwoStageApprovalStore({
  now = () => 1_800_000_000_000,
  leaseIdFactory = (sequence) => "fake-lease-" + sequence,
} = {}) {
  if (typeof now !== "function" || typeof leaseIdFactory !== "function") {
    throw new TypeError("now and leaseIdFactory must be functions.");
  }
  const tasks = new Map();
  const grants = new Map();
  const issueKeys = new Map();
  const claimKeys = new Map();
  const events = [];
  let leaseSequence = 0;
  let fencingSequence = 0;
  let failNext = false;

  function timestamp() {
    const value = now();
    if (!Number.isSafeInteger(value) || value < 0) throw new TypeError("Fake clock must return a non-negative safe integer.");
    return value;
  }

  function seedTask(task) {
    if (!task || typeof task.taskId !== "string" || tasks.has(task.taskId)) {
      throw new TypeError("seedTask requires a unique taskId.");
    }
    tasks.set(task.taskId, clone(task));
  }

  function snapshotTask(taskId) {
    const task = tasks.get(taskId);
    return task ? clone(task) : null;
  }

  function nextFailure() {
    if (!failNext) return;
    failNext = false;
    throw new Error("injected fake-store transaction failure");
  }

  async function issueApprovalGrantV1(request) {
    const key = request.principalSubject + ":" + request.idempotencyKey;
    const fp = fingerprint(request);
    const previous = issueKeys.get(key);
    if (previous) return previous.fingerprint === fp ? { outcome: "already_issued" } : { outcome: "conflict" };

    const task = tasks.get(request.taskId);
    if (!task || task.status !== "awaiting_approval" ||
        task.ownerSubject !== request.principalSubject ||
        task.taskVersion !== request.expectedTaskVersion ||
        task.payloadHash !== request.expectedPayloadHash ||
        task.agentId !== request.expectedAgentId ||
        task.agentVersion !== request.expectedAgentVersion ||
        task.capabilityId !== request.expectedCapabilityId ||
        task.capabilityVersion !== request.expectedCapabilityVersion ||
        grants.has(request.approvalTokenDigest)) {
      return { outcome: "conflict" };
    }
    const at = timestamp();
    const expiresAt = new Date(at + request.ttlMs).toISOString();
    nextFailure();

    const approved = { ...task, status: "approved", version: (task.version ?? 0) + 1 };
    const grant = {
      principalSubject: request.principalSubject,
      taskId: request.taskId,
      taskVersion: request.expectedTaskVersion,
      payloadHash: request.expectedPayloadHash,
      agentId: request.expectedAgentId,
      agentVersion: request.expectedAgentVersion,
      capabilityId: request.expectedCapabilityId,
      capabilityVersion: request.expectedCapabilityVersion,
      expiresAtMs: at + request.ttlMs,
      consumed: false,
    };
    tasks.set(request.taskId, approved);
    grants.set(request.approvalTokenDigest, grant);
    issueKeys.set(key, { fingerprint: fp });
    events.push({ sequence: events.length + 1, taskId: request.taskId, type: "approved", at });
    return { outcome: "issued", task: clone(approved), expiresAt };
  }

  async function claimApprovedTaskV1(request) {
    const key = request.principalSubject + ":" + request.idempotencyKey;
    const fp = fingerprint(request);
    const previous = claimKeys.get(key);
    if (previous) return previous.fingerprint === fp ? clone(previous.result) : { outcome: "conflict" };

    const task = tasks.get(request.taskId);
    const grant = grants.get(request.approvalTokenDigest);
    const at = timestamp();
    if (!task || task.status !== "approved" ||
        task.ownerSubject !== request.principalSubject ||
        task.taskVersion !== request.expectedTaskVersion ||
        task.payloadHash !== request.expectedPayloadHash ||
        task.agentId !== request.expectedAgentId ||
        task.agentVersion !== request.expectedAgentVersion ||
        task.capabilityId !== request.expectedCapabilityId ||
        task.capabilityVersion !== request.expectedCapabilityVersion ||
        !grant || grant.consumed || grant.expiresAtMs <= at ||
        grant.principalSubject !== request.principalSubject ||
        grant.taskId !== request.taskId ||
        grant.taskVersion !== request.expectedTaskVersion ||
        grant.payloadHash !== request.expectedPayloadHash ||
        grant.agentId !== request.expectedAgentId ||
        grant.agentVersion !== request.expectedAgentVersion ||
        grant.capabilityId !== request.expectedCapabilityId ||
        grant.capabilityVersion !== request.expectedCapabilityVersion) {
      return { outcome: "not_available" };
    }
    nextFailure();

    leaseSequence += 1;
    fencingSequence += 1;
    const lease = {
      leaseId: leaseIdFactory(leaseSequence),
      workerSubject: request.workerSubject,
      fencingToken: fencingSequence,
      expiresAt: new Date(at + request.leaseDurationMs).toISOString(),
    };
    const running = { ...task, status: "running", version: (task.version ?? 0) + 1 };
    grant.consumed = true;
    tasks.set(request.taskId, running);
    const result = { outcome: "claimed", task: clone(running), lease };
    claimKeys.set(key, { fingerprint: fp, result: clone(result) });
    events.push({ sequence: events.length + 1, taskId: request.taskId, type: "claimed", at, fencingToken: lease.fencingToken });
    return result;
  }

  return Object.freeze({
    seedTask,
    snapshotTask,
    issueApprovalGrantV1,
    claimApprovedTaskV1,
    advanceTime(ms) {
      if (!Number.isSafeInteger(ms) || ms < 0) throw new TypeError("advanceTime requires a non-negative integer.");
      const base = timestamp();
      let current = base + ms;
      now = () => current;
      return current;
    },
    getEvents: () => clone(events),
    getGrantCount: () => grants.size,
    failNextTransaction: () => { failNext = true; },
  });
}
