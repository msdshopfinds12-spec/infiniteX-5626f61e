import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sidebar = readFileSync(new URL("../../src/components/Sidebar.tsx", import.meta.url), "utf8");

test("mobile icon-only navigation retains an accessible name", () => {
  assert.match(sidebar, /aria-label=\{item\.label\}/);
  assert.match(sidebar, /title=\{item\.label\}/);
  assert.match(sidebar, /<Icon size=\{18\} aria-hidden="true" \/>/);
});

test("navigation keeps the active page state exposed", () => {
  assert.match(sidebar, /aria-current=\{active \? "page" : undefined\}/);
});
