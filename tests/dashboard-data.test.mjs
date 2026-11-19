import test from "node:test";
import assert from "node:assert/strict";
import { filterAgents } from "../src/lib/dashboard-data.mjs";

const agents = [
  { id: "1", name: "Atlas", role: "Planner", task: "Example planning task" },
  { id: "2", name: "Forge", role: "Codegen", task: "Example code generation task" },
  { id: "3", name: "Sentinel", role: "Reviewer", task: "Example review task" },
];

test("returns all records for an empty query", () => {
  assert.deepEqual(filterAgents(agents), agents);
  assert.deepEqual(filterAgents(agents, "  "), agents);
});

test("matches names without case sensitivity", () => {
  assert.deepEqual(filterAgents(agents, "ATLAS"), [agents[0]]);
});

test("matches role and task text", () => {
  assert.deepEqual(filterAgents(agents, "reviewer"), [agents[2]]);
  assert.deepEqual(filterAgents(agents, "code generation"), [agents[1]]);
});

test("returns an empty list when there is no match", () => {
  assert.deepEqual(filterAgents(agents, "not-found"), []);
});

test("handles invalid collection input safely", () => {
  assert.deepEqual(filterAgents(null, "atlas"), []);
});

test("normalizes search consistently without relying on runtime locale", () => {
  assert.deepEqual(filterAgents(agents, "  ATLAS  "), [agents[0]]);
});

test("ignores malformed records without throwing", () => {
  const mixed = [agents[0], null, undefined, { name: 42, role: null, task: "safe task" }];
  assert.deepEqual(filterAgents(mixed, "atlas"), [agents[0]]);
  assert.deepEqual(filterAgents(mixed, "safe task"), [mixed[3]]);
});

test("does not interpret HTML-like search text as executable content", () => {
  const payload = '<img src=x onerror=alert(1)>';
  assert.deepEqual(filterAgents(agents, payload), []);
});
