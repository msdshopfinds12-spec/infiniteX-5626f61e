import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

async function sourceFiles(directory) {
  const entries = await readdir(new URL(directory, root), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(path);
  }
  return files;
}

test("browser entry wires only the reviewed authenticated read services", async () => {
  const main = await read("src/main.tsx");
  for (const service of [
    "createSupabaseAuthSessionAdapter",
    "createWorkflowReadService",
    "createProfileReadService",
    "createProjectReadService",
  ]) assert.match(main, new RegExp(service));
  assert.match(main, /createBrowserSupabaseClient/);
  assert.match(main, /supabaseResult\.status === "ready"/);
  assert.match(main, /workflowReadService/);
  assert.match(main, /profileReadService/);
  assert.match(main, /projectReadService/);
});

test("browser read projections exclude tenant identifiers, project content, and secret hashes", async () => {
  const profile = await read("src/features/profile/profile-read-service.ts");
  const projects = await read("src/features/projects/project-read-service.ts");
  const workflow = await read("src/features/workflows/workflow-read-service.ts");
  const apiMetadata = await read("src/features/security/api-key-metadata.ts");

  assert.match(profile, /\.from\("profiles"\)\s*\.select\(PROFILE_COLUMNS\)/);
  assert.doesNotMatch(profile, /\.eq\(\s*["']id["']/);
  assert.match(projects, /\.from\("user_projects"\)\s*\.select\(PROJECT_COLUMNS\)/);
  assert.doesNotMatch(projects, /\.select\([^\n]*(user_id|owner_id|content)/);
  assert.match(workflow, /\.from\("workflows"\)/);
  assert.match(workflow, /\.from\("workflow_runs"\)/);
  assert.match(workflow, /\.from\("workflow_logs"\)/);
  assert.doesNotMatch(workflow, /\.(insert|update|upsert|delete)\s*\(/);
  assert.doesNotMatch(apiMetadata, /["']key_hash["']/);
  assert.match(apiMetadata, /Never add key_hash/);
});

test("browser code cannot directly mutate worker-owned runs or access API-key table", async () => {
  const files = await sourceFiles("src");
  const violations = [];
  for (const path of files) {
    const source = await readFile(new URL(path, root), "utf8");
    if (/\.from\(\s*["']workflow_runs["']\s*\)[\s\S]{0,400}?\.(insert|update|upsert|delete)\s*\(/.test(source)) {
      violations.push(path + ": direct workflow_runs mutation");
    }
    if (/\.from\(\s*["']platform_api_keys["']\s*\)/.test(source)) {
      violations.push(path + ": browser API-key table access");
    }
  }
  assert.deepEqual(violations, [], "unsafe browser data access detected");
});

test("workflow run request contains only caller input and workflow identity", async () => {
  const request = await read("src/features/workflows/workflow-run-request.ts");
  assert.match(request, /workflow_id:\s*string/);
  assert.match(request, /input:\s*Json/);
  assert.match(request, /owner_id from the verified session/);
  assert.doesNotMatch(request, /owner_id:\s*|status:\s*|attempt:\s*|output:\s*/);
});

test("API-key browser adapter delegates to authenticated Edge Function and validates response shape", async () => {
  const browser = await read("src/features/security/api-key-service.ts");
  const edge = await read("supabase/functions/ashaa-api-key-manager/index.ts");
  assert.match(browser, /client\.functions\.invoke/);
  assert.match(browser, /"ashaa-api-key-manager"/);
  assert.doesNotMatch(browser, /\.from\(\s*["']platform_api_keys["']\s*\)/);
  assert.match(edge, /authClient\.auth\.getUser\(bearer\)/);
  assert.match(edge, /const ownerId = authData\.user\.id/);
  assert.match(edge, /\.select\("id,label,key_prefix,scopes,expires_at,last_used_at,revoked_at,created_at"\)/);
  assert.match(edge, /key_hash: digest/);
  assert.match(edge, /\.eq\("owner_id", ownerId\)/);
  assert.doesNotMatch(edge, /\.select\([^\n]*key_hash/);
});

test("workspace distinguishes live account metadata from unverified capabilities", async () => {
  const app = await read("src/App.tsx");
  const overview = await read("src/features/overview/overview-summary.tsx");
  const snapshot = await read("src/features/overview/overview-snapshot.ts");
  assert.match(app, /READ-ONLY INTEGRATION/);
  assert.match(app, /DEMO MODE/);
  assert.match(app, /AI agent runtime/);
  assert.match(app, /Execution telemetry/);
  assert.match(app, /Security posture/);
  assert.match(app, /Not assessed in this UI/);
  assert.match(overview, /authenticated, read-only account queries/);
  assert.match(overview, /identityEpoch/);
  assert.match(overview, /Late results from a prior identity are discarded/);
  assert.match(snapshot, /listOwnWorkflows\(\{ limit: 100 \}\)/);
  assert.match(snapshot, /listOwnProjects\(\{ limit: 100 \}\)/);
  assert.match(snapshot, /Promise\.allSettled/);
  assert.doesNotMatch(app, /Sample Agent Activity/);
  assert.doesNotMatch(app, /Sample Pipeline Board/);
});
