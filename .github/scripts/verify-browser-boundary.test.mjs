import test from "node:test";
import assert from "node:assert/strict";
import { extractImportSpecifiers, isForbiddenServerImport } from "./verify-browser-boundary.mjs";

test("detects relative and aliased server-only imports", () => {
  assert.equal(isForbiddenServerImport("../../server/ai/orchestrator.mjs"), true);
  assert.equal(isForbiddenServerImport("@/server/ai/policy.mjs"), true);
  assert.equal(isForbiddenServerImport("server/ai/agent-registry.mjs"), true);
});

test("allows ordinary browser-safe imports", () => {
  assert.equal(isForbiddenServerImport("react"), false);
  assert.equal(isForbiddenServerImport("./components/Sidebar"), false);
  assert.equal(isForbiddenServerImport("../lib/dashboard-data.mjs"), false);
});

test("extracts static, side-effect and dynamic imports", () => {
  const source = [
    'import React from "react";',
    'import "./styles.css";',
    'const module = await import("../../server/secret.mjs");',
  ].join("\\n");
  assert.deepEqual(extractImportSpecifiers(source), [
    "react",
    "./styles.css",
    "../../server/secret.mjs",
  ]);
});
