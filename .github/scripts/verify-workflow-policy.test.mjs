import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const scanner = new URL("./verify-workflow-policy.mjs", import.meta.url);

test("CI workflow policy scanner is dependency-free and checks critical guardrails", async () => {
  const source = await readFile(scanner, "utf8");
  assert.match(source, /full 40-character commit SHA/);
  assert.match(source, /persist-credentials: false/);
  assert.match(source, /timeout-minutes/);
  assert.match(source, /workflow-level least-privilege permissions/);
});

test("all tracked workflow files satisfy the current CI policy", () => {
  const result = spawnSync(process.execPath, [scanner.pathname], {
    encoding: "utf8",
    timeout: 10_000,
    windowsHide: true
  });

  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.signal, null, result.stderr);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /CI workflow policy passed for [1-9][0-9]* workflow/);
});
