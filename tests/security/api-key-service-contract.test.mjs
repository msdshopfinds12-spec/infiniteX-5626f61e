import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createApiKeyService } from "../../src/features/security/api-key-service.ts";

const metadata = {
  id: "00000000-0000-4000-8000-000000000001",
  label: "Production integration",
  key_prefix: "ashaa_live_example",
  scopes: ["api:read"],
  expires_at: null,
  last_used_at: null,
  revoked_at: null,
  created_at: "2026-11-21T00:00:00.000Z",
};

function createClient(response) {
  const calls = [];
  return {
    calls,
    functions: {
      invoke: async (...args) => {
        calls.push(args);
        if (response instanceof Error) throw response;
        return response;
      },
    },
  };
}

test("list calls the authenticated Edge Function and returns metadata only", async () => {
  const client = createClient({ data: { ok: true, keys: [metadata] }, error: null });
  const service = createApiKeyService(client);
  const result = await service.list();

  assert.deepEqual(result, { status: "success", data: [metadata] });
  assert.equal(client.calls.length, 1);
  assert.equal(client.calls[0][0], "ashaa-api-key-manager");
  assert.deepEqual(client.calls[0][1], { body: { action: "list" } });
});

test("create trims input, defaults to read-only scope, and returns one-time key response", async () => {
  const payload = {
    ok: true,
    key: "ashaa_live_synthetic_one_time_value",
    record: {
      id: metadata.id,
      label: "Production integration",
      key_prefix: metadata.key_prefix,
      scopes: ["api:read"],
      expires_at: null,
      created_at: metadata.created_at,
    },
    warning: "Copy this key now. It cannot be retrieved again.",
  };
  const client = createClient({ data: payload, error: null });
  const result = await createApiKeyService(client).create({ label: "  Production integration  " });

  assert.equal(result.status, "success");
  if (result.status === "success") assert.equal(result.data.key, payload.key);
  assert.deepEqual(client.calls[0][1], {
    body: { action: "create", label: "Production integration", scopes: ["api:read"] },
  });
});

test("create validates label, scopes, and expiry before making a request", async () => {
  const client = createClient({ data: {}, error: null });
  const service = createApiKeyService(client);

  assert.deepEqual(await service.create({ label: "  " }), {
    status: "error", code: "invalid_label",
  });
  assert.deepEqual(await service.create({ label: "valid", scopes: ["admin" ] }), {
    status: "error", code: "invalid_scopes",
  });
  assert.deepEqual(await service.create({ label: "valid", expiresInDays: 366 }), {
    status: "error", code: "invalid_expiration",
  });
  assert.equal(client.calls.length, 0);
});

test("revoke rejects malformed IDs locally and sends only a valid ID to the function", async () => {
  const client = createClient({
    data: { ok: true, revoked: { id: metadata.id, revoked_at: "2026-11-21T01:00:00.000Z" } },
    error: null,
  });
  const service = createApiKeyService(client);

  assert.deepEqual(await service.revoke("not-a-uuid"), {
    status: "error", code: "invalid_key_id",
  });
  assert.equal(client.calls.length, 0);

  const result = await service.revoke(metadata.id);
  assert.deepEqual(client.calls[0][1], { body: { action: "revoke", id: metadata.id } });
  assert.deepEqual(result, {
    status: "success",
    data: { id: metadata.id, revoked_at: "2026-11-21T01:00:00.000Z" },
  });
});

test("provider errors and malformed responses are normalized", async () => {
  const failed = createApiKeyService(createClient({
    data: null, error: new Error("private provider detail"),
  }));
  assert.deepEqual(await failed.list(), { status: "error", code: "request_failed" });

  const malformed = createApiKeyService(createClient({
    data: { ok: true, keys: [{ ...metadata, key_hash: "should-never-be-here" }] },
    error: null,
  }));
  assert.deepEqual(await malformed.list(), { status: "error", code: "invalid_response" });

  const network = createApiKeyService(createClient(new Error("private network detail")));
  assert.deepEqual(await network.list(), { status: "error", code: "network_unavailable" });
});

test("browser adapter invokes the function and never queries platform_api_keys directly", () => {
  const source = readFileSync(
    new URL("../../src/features/security/api-key-service.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /functions\.invoke/);
  assert.doesNotMatch(source, /\.from\(["']platform_api_keys["']\)/);
});

test("Edge Function keeps hash operations server-side and scopes list/revoke by owner", () => {
  const source = readFileSync(
    new URL("../../supabase/functions/ashaa-api-key-manager/index.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /\.select\("id,label,key_prefix,scopes,expires_at,last_used_at,revoked_at,created_at"\)/);
  assert.match(source, /\.eq\("owner_id", ownerId\)/);
  assert.match(source, /key_hash:\s*digest/);
  assert.match(source, /\.update\(\{\s*revoked_at:/);
  assert.doesNotMatch(source, /\.select\([^)]*key_hash/);
});
