import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("web app manifest declares a standalone scoped application", async () => {
  const manifest = JSON.parse(await read("../public/manifest.webmanifest"));
  assert.equal(manifest.name, "InfiniteX AI Engineering Workspace");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.icons.some((icon) => icon.src === "/icons/infiniteX.svg"));
});

test("service worker only caches same-origin GET assets and excludes API paths", async () => {
  const worker = await read("../public/sw.js");
  assert.match(worker, /request\.method !== "GET"/);
  assert.match(worker, /url\.origin !== self\.location\.origin/);
  assert.match(worker, /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.match(worker, /request\.destination/);
  assert.match(worker, /offline\.html/);
});

test("service worker registration is production-only and feature-detected", async () => {
  const source = await read("../src/lib/pwa/registerServiceWorker.ts");
  assert.match(source, /import\.meta\.env\.PROD/);
  assert.match(source, /"serviceWorker" in navigator/);
  assert.match(source, /register\("\/sw\.js"/);
});
