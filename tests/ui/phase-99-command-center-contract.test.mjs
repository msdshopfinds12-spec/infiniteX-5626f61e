import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("Phase 99 AI runtime view contains no fabricated agent identities or live states", async () => {
  const agents = await read("src/components/AgentList.tsx");
  assert.doesNotMatch(agents, /sampleAgents|Atlas|Forge|Sentinel|Vault|Pulse|Quill/);
  assert.match(agents, /AI runtime is not active/);
  assert.match(agents, /Provider DISABLED|provider-disabled|Provider has not been configured|provider has not been configured/i);
  assert.match(agents, /No live agent registrations available/);
  assert.match(agents, /Execution telemetry/);
});

test("Phase 99 activity view contains no fabricated timestamps, logs or test counts", async () => {
  const logs = await read("src/components/LogStream.tsx");
  assert.doesNotMatch(logs, /sampleLogs|06:41:|142 passed|sample deploy|health probe timed out/);
  assert.match(logs, /Global event stream is not connected/);
  assert.match(logs, /Pipelines/);
  assert.match(logs, /authenticated workflow read service/);
});

test("Phase 99 app labels provider, production security and activity truthfully", async () => {
  const app = await read("src/App.tsx");
  assert.match(app, /AI model provider/);
  assert.match(app, /Disabled · not configured/);
  assert.match(app, /production security posture remain unverified/);
  assert.match(app, /Workflow Activity/);
  assert.doesNotMatch(app, /Registered AI Agents \(sample\)|Sample Log Entries/);
});

test("Phase 99 navigation reflects the session and retains accessible names", async () => {
  const sidebar = await read("src/components/Sidebar.tsx");
  assert.match(sidebar, /workspaceLabel/);
  assert.match(sidebar, /workspaceLabel = "Preview mode"/);
  assert.match(sidebar, /aria-label=\{item.label\}/);
  assert.match(sidebar, /aria-current=\{active \? "page" : undefined\}/);
});

test("Phase 99 capability and activity cards adapt to narrow mobile screens", async () => {
  const css = await read("src/styles/global.css");
  assert.match(css, /\.runtime-status-grid\s*\{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 600px\)\s*\{[\s\S]*?\.runtime-status-grid\s*\{[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /overflow-wrap: anywhere/);
});
