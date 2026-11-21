import assert from "node:assert/strict";
import test from "node:test";
import { hasActiveWorkflowRuns, WORKFLOW_RUN_POLL_INTERVAL_MS } from "./workflow-run-polling.ts";

test("polling interval is bounded to five seconds", () => {
  assert.equal(WORKFLOW_RUN_POLL_INTERVAL_MS, 5_000);
});

test("queued and running runs keep status synchronization active", () => {
  assert.equal(hasActiveWorkflowRuns([{ status: "queued" }, { status: "succeeded" }]), true);
  assert.equal(hasActiveWorkflowRuns([{ status: "running" }]), true);
});

test("terminal, unknown, and empty states stop automatic polling", () => {
  assert.equal(hasActiveWorkflowRuns([{ status: "succeeded" }]), false);
  assert.equal(hasActiveWorkflowRuns([{ status: "failed" }]), false);
  assert.equal(hasActiveWorkflowRuns([{ status: "cancelled" }]), false);
  assert.equal(hasActiveWorkflowRuns([]), false);
});
