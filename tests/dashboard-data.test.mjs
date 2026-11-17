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
