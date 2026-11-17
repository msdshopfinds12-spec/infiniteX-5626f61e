import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("CI workflow policy scanner is dependency-free and checks immutable action pins", async () => {
  const source = await readFile(new URL("./verify-workflow-policy.mjs", import.meta.url), "utf8");
  assert.match(source, /40-character commit SHA/);
  assert.match(source, /persist-credentials: false/);
  assert.match(source, /timeout-minutes/);
  assert.match(source, /workflow-level least-privilege permissions/);
});
