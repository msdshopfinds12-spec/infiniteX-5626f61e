#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CODE_EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".ts", ".tsx"]);

export function isForbiddenServerImport(specifier) {
  if (typeof specifier !== "string") return false;
  const normalized = specifier.replace(/\\/g, "/");
  return normalized.startsWith("server/") ||
    normalized.startsWith("@/server/") ||
    normalized.includes("/server/");
}

export function extractImportSpecifiers(source) {
  const matches = [];
  const pattern = /\b(?:from\s*|import\s*\()\s*["']([^"']+)["']|\bimport\s*["']([^"']+)["']/g;
  for (const match of source.matchAll(pattern)) matches.push(match[1] || match[2]);
  return matches;
}

async function collectCodeFiles(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await collectCodeFiles(absolute));
    else if (entry.isFile() && CODE_EXTENSIONS.has(path.extname(entry.name))) result.push(absolute);
  }
  return result;
}

export async function scanBrowserImports(sourceRoot = path.resolve("src")) {
  const violations = [];
  for (const file of await collectCodeFiles(sourceRoot)) {
    const source = await readFile(file, "utf8");
    for (const specifier of extractImportSpecifiers(source)) {
      if (isForbiddenServerImport(specifier)) {
        violations.push({ file: path.relative(process.cwd(), file), specifier });
      }
    }
  }
  return violations;
}

async function main() {
  const violations = await scanBrowserImports();
  if (violations.length) {
    process.stderr.write("BLOCKED: browser source imports server-only modules.\n");
    for (const item of violations) process.stderr.write(`- ${item.file}: ${item.specifier}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write("PASS: no server-only imports found in browser source.\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`Browser boundary scan failed: ${error.message}\n`);
    process.exitCode = 2;
  });
}
