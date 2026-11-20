import assert from "node:assert/strict";
import test from "node:test";
import { API_KEY_METADATA_COLUMNS } from "./api-key-metadata.ts";

test("API key browser projection contains only safe metadata", () => {
  assert.deepEqual(API_KEY_METADATA_COLUMNS, [
    "id",
    "label",
    "key_prefix",
    "scopes",
    "expires_at",
    "last_used_at",
    "revoked_at",
    "created_at",
  ]);
});

test("API key browser projection never selects key_hash", () => {
  assert.equal(
    (API_KEY_METADATA_COLUMNS as readonly string[]).includes("key_hash"),
    false,
  );
});
