import assert from "node:assert/strict";
import test from "node:test";
import { resolveAuthBootstrapState } from "./auth-bootstrap.ts";

test("ready auth configuration delegates session state to the provider", () => {
  assert.equal(resolveAuthBootstrapState({ status: "ready" }), null);
});

test("missing public auth configuration fails closed", () => {
  assert.deepEqual(resolveAuthBootstrapState({ status: "missing" }), {
    status: "error",
    identityEpoch: 0,
  });
});

test("invalid or privileged auth configuration fails closed", () => {
  assert.deepEqual(resolveAuthBootstrapState({ status: "invalid" }), {
    status: "error",
    identityEpoch: 0,
  });
});
