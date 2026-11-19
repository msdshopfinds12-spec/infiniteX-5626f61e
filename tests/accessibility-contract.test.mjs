import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sidebar = await readFile(new URL("../src/components/Sidebar.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/styles/global.css", import.meta.url), "utf8");

test("mobile navigation has a programmatic accessible name", () => {
  assert.match(sidebar, /aria-label=\{item\.label\}/);
  assert.match(sidebar, /title=\{item\.label\}/);
});

test("navigation exposes the current page and hides decorative icons", () => {
  assert.match(sidebar, /aria-current=\{active \? "page" : undefined\}/);
  assert.match(sidebar, /<Icon size=\{18\} aria-hidden="true" \/>/);
});

test("all six primary workspace views are represented", () => {
  for (const key of ["overview", "agents", "pipelines", "logs", "security", "settings"]) {
    assert.match(sidebar, new RegExp('key: "' + key + '"'));
  }
});

test("mobile navigation controls preserve a minimum 40px target", () => {
  const mobileRules = styles.split("@media (max-width: 760px)")[1] ?? "";
  assert.match(mobileRules, /\.nav-item\s*\{[^}]*min-width:\s*40px/s);
  assert.match(mobileRules, /\.nav-item\s*\{[^}]*min-height:\s*40px/s);
});

test("keyboard focus is visibly indicated", () => {
  assert.match(styles, /:focus-visible\s*\{[^}]*outline:\s*2px/s);
});

test("reduced-motion preferences are respected", () => {
  assert.match(styles, /@media \(prefers-reduced-motion:\s*reduce\)/);
  assert.match(styles, /transition-duration:\s*0\.01ms/);
});
