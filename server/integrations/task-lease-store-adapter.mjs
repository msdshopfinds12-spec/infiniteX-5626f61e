/**
 * Lease-fenced task-store adapter contract.
 *
 * This module does not implement persistence. A durable driver MUST implement
 * every operation as a single database transaction / conditional write.
 * A monotonically increasing fencingToken prevents an expired worker from
 * committing after a newer worker has reclaimed the task.
 */
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const LEASE_ID = /^[A-Za-z0-9_-]{16,128}$/;
const ISO = (value) => typeof value === "string" &&
  !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value;

export class TaskLeaseError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "TaskLeaseError";
    this.code = code;
  }
}

function requireObject(value, code = "INVALID_INPUT") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TaskLeaseError(code, "A valid operation object is required.");
  }
}
function requireId(value, field) {
  if (typeof value !== "string" || !ID.test(value)) {
    throw new TaskLeaseError("INVALID_INPUT", `${field} is invalid.`);
  }
}
function requireVersion(value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TaskLeaseError("INVALID_INPUT", "expectedVersion must be a non-negative safe integer.");
  }
}
function requireLeaseTuple(input) {
  requireObject(input);
  requireId(input.taskId, "taskId");
  requireId(input.ownerId, "ownerId");
  requireVersion(input.expectedVersion);
  if (typeof input.leaseId !== "string" || !LEASE_ID.test(input.leaseId)) {
    throw new TaskLeaseError("INVALID_INPUT", "leaseId must be an opaque identifier of at least 16 characters.");
  }
  if (!Number.isSafeInteger(input.fencingToken) || input.fencingToken < 1) {
    throw new TaskLeaseError("INVALID_INPUT", "fencingToken must be a positive safe integer.");
  }
  if (!ISO(input.now)) throw new TaskLeaseError("INVALID_INPUT", "now must be a canonical UTC timestamp.");
}
function validateClaim(snapshot, request, leaseDurationMs) {
  requireObject(snapshot, "INVALID_STORE_RESULT");
  const lease = snapshot.lease;
  if (snapshot.id !== request.taskId || snapshot.state !== "running" ||
      snapshot.version !== request.expectedVersion + 1 ||
      !lease || lease.ownerId !== request.ownerId ||
      typeof lease.leaseId !== "string" || !LEASE_ID.test(lease.leaseId) ||
      !Number.isSafeInteger(lease.fencingToken) || lease.fencingToken < 1 ||
      !ISO(lease.expiresAt)) {
    throw new TaskLeaseError("INVALID_STORE_RESULT", "The durable store returned an invalid claimed-task snapshot.");
  }
  const expiry = Date.parse(lease.expiresAt);
  const now = Date.parse(request.now);
  if (expiry <= now || expiry > now + leaseDurationMs) {
    throw new TaskLeaseError("INVALID_STORE_RESULT", "The durable store returned an out-of-policy lease expiry.");
  }
  return Object.freeze({
    id: snapshot.id,
    state: snapshot.state,
    version: snapshot.version,
    lease: Object.freeze({ ...lease }),
  });
}

/**
 * store contract (each method MUST be atomic):
 * - claimTaskWithLease({taskId, ownerId, expectedVersion, now, leaseDurationMs})
 *   returns null on conflict, otherwise a validated running snapshot.
 * - renewTaskLease({taskId, ownerId, leaseId, fencingToken, expectedVersion, now, leaseDurationMs})
 *   returns null on stale/expired lease, otherwise updated snapshot (version + 1).
 * - completeTaskWithLease / failTaskWithLease({taskId, ownerId, leaseId,
 *   fencingToken, expectedVersion, now}) return true only if exactly one row
 *   transitioned while the lease was still valid and the fencing tuple matched.
 */
export function createLeaseFencedTaskStoreAdapter({ store, leaseDurationMs = 30_000, clock = () => new Date().toISOString() } = {}) {
  requireObject(store, "INVALID_STORE");
  if (!Number.isSafeInteger(leaseDurationMs) || leaseDurationMs < 1_000 || leaseDurationMs > 300_000) {
    throw new TypeError("leaseDurationMs must be between 1000 and 300000.");
  }
  if (typeof clock !== "function") throw new TypeError("clock must be a function.");

  function now() {
    const value = clock();
    if (!ISO(value)) throw new TaskLeaseError("INVALID_CLOCK", "The lease clock must return a canonical UTC timestamp.");
    return value;
  }
  function requireMethod(name) {
    if (typeof store[name] !== "function") {
      throw new TaskLeaseError("STORE_OPERATION_UNAVAILABLE", `Durable store operation ${name} is unavailable.`);
    }
    return store[name].bind(store);
  }

  async function claim({ taskId, ownerId, expectedVersion } = {}) {
    requireId(taskId, "taskId");
    requireId(ownerId, "ownerId");
    requireVersion(expectedVersion);
    const timestamp = now();
    const result = await requireMethod("claimTaskWithLease")({
      taskId, ownerId, expectedVersion, leaseDurationMs,
    });
    if (result === null) return null;
    return validateClaim(result, { taskId, ownerId, expectedVersion, now: timestamp }, leaseDurationMs);
  }

  async function renew(input = {}) {
    if (Object.hasOwn(input, "now")) {
      throw new TaskLeaseError("UNTRUSTED_TIME_INPUT", "Lease timestamps are generated by the trusted adapter, never supplied by callers.");
    }
    const timestamp = now();
    requireLeaseTuple({ ...input, now: timestamp });
    const operation = requireMethod("renewTaskLease");
    const result = await operation({
      taskId: input.taskId, ownerId: input.ownerId, leaseId: input.leaseId,
      fencingToken: input.fencingToken, expectedVersion: input.expectedVersion,
      leaseDurationMs,
    });
    if (result === null) return null;
    const renewed = validateClaim(result, {
      taskId: input.taskId, ownerId: input.ownerId,
      expectedVersion: input.expectedVersion, now: timestamp,
    }, leaseDurationMs);
    if (renewed.lease.leaseId !== input.leaseId ||
        renewed.lease.fencingToken !== input.fencingToken) {
      throw new TaskLeaseError("INVALID_STORE_RESULT", "Lease renewal must preserve the active lease identity and fencing token.");
    }
    return renewed;
  }

  async function settle(kind, input = {}) {
    if (Object.hasOwn(input, "now")) {
      throw new TaskLeaseError("UNTRUSTED_TIME_INPUT", "Lease timestamps are generated by the trusted adapter, never supplied by callers.");
    }
    const timestamp = now();
    requireLeaseTuple({ ...input, now: timestamp });
    if (kind !== "complete" && kind !== "fail") {
      throw new TaskLeaseError("INVALID_SETTLEMENT", "Only complete or fail is supported.");
    }
    const method = kind === "complete" ? "completeTaskWithLease" : "failTaskWithLease";
    const result = await requireMethod(method)({
      taskId: input.taskId, ownerId: input.ownerId, leaseId: input.leaseId,
      fencingToken: input.fencingToken, expectedVersion: input.expectedVersion,
    });
    if (result !== true && result !== false) {
      throw new TaskLeaseError("INVALID_STORE_RESULT", "The durable store must return a boolean settlement result.");
    }
    return result;
  }

  return Object.freeze({
    claim,
    renew,
    complete: (input) => settle("complete", input),
    fail: (input) => settle("fail", input),
  });
}
