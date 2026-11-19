import test from "node:test";
import assert from "node:assert/strict";
import { createAdapterRegistry, AdapterContractError } from "../server/integrations/adapter-contract.mjs";

const descriptor = {
  id: "iq-core-reference",
  version: "0.1.0",
  sourceRepository: "https://github.com/msdshopfinds12-spec/msdshopfinds12-spec-infiniteGX.7-IQ-Core",
  sourceCommit: "0123456789abcdef0123456789abcdef01234567",
  licenseVerified: false,
  ownerReuseApproved: false,
  runtime: "python-worker",
  capabilities: ["compute:local", "read:agent-catalog"],
  networkPolicy: "none",
  maxEstimatedCostUsd: 0,
  status: "review-required",
};

test("registers metadata-only adapter in disabled state", () => {
  const registry = createAdapterRegistry([descriptor]);
  const adapter = registry.get("iq-core-reference");
  assert.equal(adapter.status, "disabled");
  assert.equal(adapter.networkPolicy, "none");
  assert.equal(adapter.maxEstimatedCostUsd, 0);
  assert.equal(Object.isFrozen(adapter), true);
  assert.equal(Object.isFrozen(adapter.capabilities), true);
});

test("rejects duplicate adapter identifiers", () => {
  assert.throws(
    () => createAdapterRegistry([descriptor, descriptor]),
    (error) => error instanceof AdapterContractError && error.code === "DUPLICATE_ADAPTER",
  );
});

test("fails closed when source provenance is incomplete", () => {
  assert.throws(
    () => createAdapterRegistry([{ ...descriptor, sourceCommit: "main" }]),
    (error) => error.code === "INVALID_PROVENANCE",
  );
});

test("rejects unknown or privileged capabilities", () => {
  assert.throws(
    () => createAdapterRegistry([{ ...descriptor, capabilities: ["shell:execute"] }]),
    (error) => error.code === "INVALID_CAPABILITY",
  );
});

test("rejects network access and non-zero budgets", () => {
  assert.throws(
    () => createAdapterRegistry([{ ...descriptor, networkPolicy: "allowlist" }]),
    (error) => error.code === "NETWORK_NOT_ALLOWED",
  );
  assert.throws(
    () => createAdapterRegistry([{ ...descriptor, maxEstimatedCostUsd: 0.01 }]),
    (error) => error.code === "NONZERO_BUDGET",
  );
});

test("requires license and owner reuse gates to be explicit", () => {
  const { licenseVerified, ...missing } = descriptor;
  assert.throws(
    () => createAdapterRegistry([missing]),
    (error) => error.code === "MISSING_REUSE_GATES",
  );
});

test("keeps adapter disabled even after metadata gates are marked true", () => {
  const registry = createAdapterRegistry([{
    ...descriptor,
    licenseVerified: true,
    ownerReuseApproved: true,
  }]);
  assert.equal(registry.get("iq-core-reference").status, "disabled");
});
