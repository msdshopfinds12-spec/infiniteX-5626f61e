import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { analyzeWorkflow } from "./verify-workflow-policy.mjs";

const scanner = new URL("./verify-workflow-policy.mjs", import.meta.url);

const safeWorkflow = [
  "name: Safe CI",
  "on:",
  "  pull_request:",
  "permissions:",
  "  contents: read",
  "jobs:",
  "  verify:",
  "    runs-on: ubuntu-latest",
  "    timeout-minutes: 10",
  "    permissions:",
  "      contents: read",
  "    steps:",
  "      - uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0",
  "        with:",
  "          persist-credentials: false",
  "      - run: npm test"
].join("\n");

test("accepts a structurally valid least-privilege workflow", () => {
  assert.deepEqual(analyzeWorkflow(safeWorkflow), []);
});

test("rejects malformed YAML and duplicate keys", () => {
  const malformed = analyzeWorkflow("name: broken\nname: duplicate\njobs: [");
  assert.ok(malformed.some((issue) => /Invalid YAML/.test(issue.message)));
});

test("rejects duplicate YAML mapping keys", () => {
  const duplicate = safeWorkflow.replace("name: Safe CI", "name: Safe CI\nname: Shadowed CI");
  const issues = analyzeWorkflow(duplicate);
  assert.ok(issues.some((issue) => /Invalid YAML/.test(issue.message)));
});

test("rejects untrusted ref interpolation in shell", () => {
  const source = safeWorkflow.replace("run: npm test", 'run: echo "${{ github.ref }}"');
  assert.ok(analyzeWorkflow(source).some((issue) => /untrusted GitHub event/.test(issue.message)));
});

test("rejects pull_request_target", () => {
  const source = safeWorkflow.replace("  pull_request:", "  pull_request_target:");
  assert.ok(analyzeWorkflow(source).some((issue) => /pull_request_target/.test(issue.message)));
});

test("rejects write permissions at workflow and job scope", () => {
  const source = safeWorkflow
    .replace("contents: read", "contents: write")
    .replace("contents: read", "contents: write");
  const issues = analyzeWorkflow(source);
  assert.ok(issues.some((issue) => /Permission must/.test(issue.message)));
});

test("requires explicit permissions and finite job timeout", () => {
  const source = safeWorkflow
    .replace("    permissions:\n      contents: read\n", "")
    .replace("    timeout-minutes: 10", "    timeout-minutes: 0");
  const issues = analyzeWorkflow(source);
  assert.ok(issues.some((issue) => /explicit mapping/.test(issue.message)));
  assert.ok(issues.some((issue) => /finite timeout/.test(issue.message)));
});

test("rejects mutable action tags and checkout credential persistence", () => {
  const mutable = safeWorkflow.replace(/@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0/, "@v4");
  assert.ok(analyzeWorkflow(mutable).some((issue) => /full 40-character commit SHA/.test(issue.message)));

  const credentialed = safeWorkflow.replace("persist-credentials: false", "persist-credentials: true");
  assert.ok(analyzeWorkflow(credentialed).some((issue) => /persist-credentials: false/.test(issue.message)));
});

test("rejects untrusted GitHub context and direct secret interpolation in shell", () => {
  const eventInjection = safeWorkflow.replace("run: npm test", 'run: echo "\${{ github.event.pull_request.title }}"');
  assert.ok(analyzeWorkflow(eventInjection).some((issue) => /untrusted GitHub event/.test(issue.message)));

  const secretInterpolation = safeWorkflow.replace("run: npm test", 'run: echo "\${{ secrets.DEPLOY_TOKEN }}"');
  assert.ok(analyzeWorkflow(secretInterpolation).some((issue) => /secrets directly/.test(issue.message)));
});

test("repository workflow files satisfy the structural CI policy", () => {
  const result = spawnSync(process.execPath, [scanner.pathname], {
    encoding: "utf8",
    timeout: 10_000,
    windowsHide: true
  });

  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.signal, null, result.stderr);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /CI workflow policy passed for [1-9][0-9]* workflow/);
});

test("policy implementation uses a YAML parser rather than line-oriented regex parsing", async () => {
  const source = await readFile(scanner, "utf8");
  assert.match(source, /parseDocument/);
  assert.match(source, /document\.toJS/);
  assert.match(source, /checkPermissions/);
});
