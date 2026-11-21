import assert from "node:assert/strict";
import test from "node:test";
import { parseApiKeyManagerRequest } from "../../supabase/functions/_shared/api-key-request.mjs";

test("API key request parser accepts only exact list action schema", () => {
  assert.deepEqual(parseApiKeyManagerRequest({ action: "list" }), {
    ok: true, value: { action: "list" },
  });
  assert.deepEqual(parseApiKeyManagerRequest({ action: "list", owner_id: "attacker" }), {
    ok: false, error: "unsupported_request_field",
  });
});

test("API key create parser trims labels and defaults to read-only scope", () => {
  assert.deepEqual(parseApiKeyManagerRequest({
    action: "create", label: "  integration  ",
  }), {
    ok: true,
    value: { action: "create", label: "integration", scopes: ["api:read"] },
  });
});

test("API key create parser rejects duplicate, unknown, empty and oversized scopes", () => {
  for (const scopes of [
    [], ["api:read", "api:read"], ["admin"], ["api:read", "api:write", "api:read"],
  ]) {
    assert.deepEqual(parseApiKeyManagerRequest({
      action: "create", label: "valid", scopes,
    }), { ok: false, error: "invalid_scopes" });
  }
});

test("API key create parser rejects unknown fields and invalid expiration boundaries", () => {
  assert.deepEqual(parseApiKeyManagerRequest({
    action: "create", label: "valid", role: "admin",
  }), { ok: false, error: "unsupported_request_field" });

  for (const expires_in_days of [0, -1, 1.5, 366, "30", null]) {
    assert.deepEqual(parseApiKeyManagerRequest({
      action: "create", label: "valid", expires_in_days,
    }), { ok: false, error: "expires_in_days_must_be_1_to_365" });
  }

  assert.equal(parseApiKeyManagerRequest({
    action: "create", label: "valid", expires_in_days: 1,
  }).ok, true);
  assert.equal(parseApiKeyManagerRequest({
    action: "create", label: "valid", expires_in_days: 365,
  }).ok, true);
});

test("API key revoke parser requires a UUID and rejects extra fields", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  assert.deepEqual(parseApiKeyManagerRequest({ action: "revoke", id }), {
    ok: true, value: { action: "revoke", id },
  });
  assert.deepEqual(parseApiKeyManagerRequest({ action: "revoke", id, owner_id: id }), {
    ok: false, error: "unsupported_request_field",
  });
  assert.deepEqual(parseApiKeyManagerRequest({ action: "revoke", id: "bad" }), {
    ok: false, error: "invalid_key_id",
  });
});

test("API key request parser rejects arrays, null, primitives and unknown actions", () => {
  for (const value of [null, [], "list", 42, { action: "delete" }]) {
    const result = parseApiKeyManagerRequest(value);
    assert.equal(result.ok, false);
  }
});
