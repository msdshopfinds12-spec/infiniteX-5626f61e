import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { scanBrowserImportGraph } from "./verify-browser-boundary.mjs";

async function fixture(files, run) {
  const root = await mkdtemp(path.join(os.tmpdir(), "infiniteX-boundary-"));
  try {
    for (const [name, content] of Object.entries(files)) {
      const target = path.join(root, name);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, content, "utf8");
    }
    return await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("accepts a browser-only transitive import graph", async () => {
  const result = await fixture({
    "src/main.tsx": 'import App from "./App"; createRoot(document.getElementById("root")!).render(App);',
    "src/App.tsx": 'import { formatLabel } from "./utils"; export default formatLabel;',
    "src/utils.ts": 'export const formatLabel = (value: string) => value.trim();'
  }, (root) => scanBrowserImportGraph({ rootDir: root }));
  assert.deepEqual(result.issues, []);
  assert.equal(result.files.length, 3);
});

test("rejects a trusted AI module reached through an indirect import", async () => {
  const result = await fixture({
    "src/main.tsx": 'import App from "./components/App";',
    "src/components/App.tsx": 'export { createOrchestrator } from "../lib/ai/orchestrator.mjs";',
    "src/lib/ai/orchestrator.mjs": 'export function createOrchestrator() {}'
  }, (root) => scanBrowserImportGraph({ rootDir: root }));
  assert.ok(result.issues.some((issue) => /server-only/.test(issue.message)));
});

test("rejects Node.js built-ins in browser modules", async () => {
  const result = await fixture({
    "src/main.tsx": 'import "./client.js";',
    "src/client.js": 'import { readFile } from "node:fs/promises"; export { readFile };'
  }, (root) => scanBrowserImportGraph({ rootDir: root }));
  assert.ok(result.issues.some((issue) => /Node.js built-in/.test(issue.message)));
});

test("rejects non-literal dynamic imports that cannot be audited", async () => {
  const result = await fixture({
    "src/main.tsx": 'const moduleName = getModuleName(); import(moduleName);'
  }, (root) => scanBrowserImportGraph({ rootDir: root }));
  assert.ok(result.issues.some((issue) => /Non-literal dynamic import/.test(issue.message)));
});

test("rejects unresolved relative source imports rather than silently skipping them", async () => {
  const result = await fixture({
    "src/main.tsx": 'import "./missing-module";'
  }, (root) => scanBrowserImportGraph({ rootDir: root }));
  assert.ok(result.issues.some((issue) => /Unable to resolve source import/.test(issue.message)));
});

test("rejects imports that escape the repository root", async () => {
  const result = await fixture({
    "src/main.tsx": 'import "../../../outside";'
  }, (root) => scanBrowserImportGraph({ rootDir: root }));
  assert.ok(result.issues.some((issue) => /escapes the repository root/.test(issue.message)));
});

test("resolves the configured @/* TypeScript alias and rejects aliased server imports", async () => {
  const result = await fixture({
    "src/main.tsx": 'import App from "@/components/App";',
    "src/components/App.tsx": 'export { createOrchestrator } from "@/lib/ai/orchestrator.mjs";',
    "src/lib/ai/orchestrator.mjs": 'export function createOrchestrator() {}'
  }, (root) => scanBrowserImportGraph({ rootDir: root }));
  assert.ok(result.issues.some((issue) => /server-only/.test(issue.message)));
});

test("the actual browser entrypoint has no trusted server-only imports", async () => {
  const result = await scanBrowserImportGraph();
  assert.deepEqual(result.issues, []);
  assert.ok(result.files.includes("src/main.tsx"));
});
