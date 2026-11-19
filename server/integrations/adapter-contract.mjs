/**
 * Provider-neutral contract for optional repository adapters.
 *
 * This registry validates metadata only. It never imports modules, executes
 * plugin code, opens network connections, or grants capabilities.
 */
const ID = /^[a-z][a-z0-9-]{1,47}$/;
const RUNTIMES = new Set(["browser", "node", "python-worker"]);
const CAPABILITIES = new Set([
  "read:project-metadata",
  "read:local-files",
  "read:agent-catalog",
  "compute:local",
  "event:publish",
]);
const NETWORK_POLICIES = new Set(["none"]);
const ADAPTER_STATES = new Set(["disabled", "review-required"]);

export class AdapterContractError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "AdapterContractError";
    this.code = code;
  }
}

function validateDescriptor(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new AdapterContractError("INVALID_DESCRIPTOR", "Adapter descriptor must be an object.");
  }
  if (typeof input.id !== "string" || !ID.test(input.id)) {
    throw new AdapterContractError("INVALID_ID", "Adapter id must be a lowercase slug.");
  }
  if (typeof input.version !== "string" || !/^\d+\.\d+\.\d+$/.test(input.version)) {
    throw new AdapterContractError("INVALID_VERSION", "Adapter version must use semantic version format.");
  }
  if (typeof input.sourceRepository !== "string" ||
      !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(input.sourceRepository)) {
    throw new AdapterContractError("INVALID_SOURCE", "A canonical GitHub repository URL is required.");
  }
  if (typeof input.sourceCommit !== "string" || !/^[a-f0-9]{40}$/.test(input.sourceCommit)) {
    throw new AdapterContractError("INVALID_PROVENANCE", "A full 40-character source commit is required.");
  }
  if (typeof input.licenseVerified !== "boolean" || typeof input.ownerReuseApproved !== "boolean") {
    throw new AdapterContractError("MISSING_REUSE_GATES", "License and owner reuse approval must be explicit booleans.");
  }
  if (typeof input.runtime !== "string" || !RUNTIMES.has(input.runtime)) {
    throw new AdapterContractError("INVALID_RUNTIME", "Adapter runtime is not supported.");
  }
  if (!Array.isArray(input.capabilities) ||
      input.capabilities.some((capability) => !CAPABILITIES.has(capability))) {
    throw new AdapterContractError("INVALID_CAPABILITY", "Adapter requested an unknown or privileged capability.");
  }
  if (input.networkPolicy !== "none" || !NETWORK_POLICIES.has(input.networkPolicy)) {
    throw new AdapterContractError("NETWORK_NOT_ALLOWED", "Network access is disabled in the initial adapter contract.");
  }
  if (input.maxEstimatedCostUsd !== 0) {
    throw new AdapterContractError("NONZERO_BUDGET", "Initial adapter contracts require a zero-dollar cost ceiling.");
  }
  if (!ADAPTER_STATES.has(input.status)) {
    throw new AdapterContractError("INVALID_STATUS", "Adapter must remain disabled or review-required.");
  }
  if (input.licenseVerified && input.ownerReuseApproved && input.status !== "disabled") {
    throw new AdapterContractError("EXPLICIT_ENABLE_REQUIRED", "Adapters remain disabled until a separate enablement review.");
  }

  return Object.freeze({
    id: input.id,
    version: input.version,
    sourceRepository: input.sourceRepository,
    sourceCommit: input.sourceCommit,
    licenseVerified: input.licenseVerified,
    ownerReuseApproved: input.ownerReuseApproved,
    runtime: input.runtime,
    capabilities: Object.freeze([...new Set(input.capabilities)]),
    networkPolicy: "none",
    maxEstimatedCostUsd: 0,
    status: "disabled",
  });
}

export function createAdapterRegistry(initialAdapters = []) {
  if (!Array.isArray(initialAdapters)) {
    throw new TypeError("Initial adapters must be an array.");
  }
  const adapters = new Map();

  function register(descriptor) {
    const adapter = validateDescriptor(descriptor);
    if (adapters.has(adapter.id)) {
      throw new AdapterContractError("DUPLICATE_ADAPTER", "Adapter is already registered.");
    }
    adapters.set(adapter.id, adapter);
    return adapter;
  }

  function get(id) {
    return adapters.get(id) || null;
  }

  function list() {
    return Object.freeze([...adapters.values()]);
  }

  for (const descriptor of initialAdapters) register(descriptor);

  return Object.freeze({ register, get, list });
}
