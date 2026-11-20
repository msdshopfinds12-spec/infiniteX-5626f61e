import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";

const root = new URL("../src/", import.meta.url);
const allowedPublicVariables = new Set([
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_WORKFLOW_RUN_ENQUEUE_ENABLED",
]);

async function collectSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectSourceFiles(path));
    else if (/\.(?:[cm]?[jt]sx?)$/i.test(entry.name) && !/(?:\.test|\.spec)\.[cm]?[jt]sx?$/i.test(entry.name)) files.push(path);
  }
  return files;
}

test("browser source references only explicitly approved public environment variables", async () => {
  const files = await collectSourceFiles(root.pathname);
  const violations = [];

  for (const file of files) {
    const source = await readFile(file, "utf8");
    const references = source.matchAll(/import\.meta\.env\.([A-Z][A-Z0-9_]*)/g);
    for (const match of references) {
      if (match[1].startsWith("VITE_") && !allowedPublicVariables.has(match[1])) {
        violations.push(`${relative(root.pathname, file)} references ${match[1]}`);
      }
    }

    if (/\b(?:SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY|INFINITEX_ALLOWED_ORIGINS|SIMULA_WORKER_SECRET|BILLING_WEBHOOK_SECRET)\b/.test(source)) {
      violations.push(`${relative(root.pathname, file)} references a server-only secret variable`);
    }

    if (/sb_secret_[A-Za-z0-9_-]{8,}/.test(source)) {
      violations.push(`${relative(root.pathname, file)} contains a Supabase secret-key literal`);
    }

    if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(source)) {
      violations.push(`${relative(root.pathname, file)} contains a private-key PEM block`);
    }
  }

  assert.deepEqual(violations, [], `Browser secret-boundary violations:\n${violations.join("\n")}`);
});

test(".env.example exposes only the two documented public browser settings", async () => {
  const example = await readFile(new URL("../.env.example", import.meta.url), "utf8");
  const assignments = example
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => line.slice(0, line.indexOf("=")));

  assert.deepEqual(assignments, [
    "VITE_SUPABASE_URL",
    "VITE_SUPABASE_PUBLISHABLE_KEY",
  ]);
});
