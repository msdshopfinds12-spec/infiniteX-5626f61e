import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseDocument } from "yaml";

const root = new URL("../../", import.meta.url);
const [lockfileText, advisory, frontendCi, securityCi, viteCi] = await Promise.all([
  readFile(new URL("package-lock.json", root), "utf8"),
  readFile(new URL("docs/security/phase-4m4-picomatch-advisory.md", root), "utf8"),
  readFile(new URL(".github/workflows/frontend-ci.yml", root), "utf8"),
  readFile(new URL(".github/workflows/security-regression.yml", root), "utf8"),
  readFile(new URL(".github/workflows/vite-security-remediation.yml", root), "utf8"),
]);

const lockfile = JSON.parse(lockfileText);
const workflowSources = {
  "frontend-ci.yml": frontendCi,
  "security-regression.yml": securityCi,
  "vite-security-remediation.yml": viteCi,
};

async function parseWorkflow(source, name) {
  const document = parseDocument(source, {
    version: "1.2",
    strict: true,
    uniqueKeys: true,
  });
  assert.deepEqual(document.errors, [], name + " must remain valid YAML");
  return document.toJS();
}

test("known affected picomatch versions cannot be documented as resolved", () => {
  const version = lockfile.packages?.["node_modules/picomatch"]?.version;
  assert.ok(version, "package-lock.json must contain the resolved picomatch package");

  // This list is intentionally explicit and must be updated only with advisory evidence.
  const knownAffectedVersions = new Set(["4.0.7"]);
  if (knownAffectedVersions.has(version)) {
    assert.match(
      advisory,
      /\*\*Status: UNRESOLVED \/ RELEASE BLOCKING\*\*/,
      "known affected dependency must remain visibly unresolved and release-blocking",
    );
  } else {
    assert.match(
      advisory,
      /## Verified remediation evidence/i,
      "a new version requires recorded upstream advisory and CI evidence before closure",
    );
  }
});

test("frontend CI keeps dependency audit fail-closed", () => {
  assert.match(frontendCi, /id: dependency_audit[\s\S]*?continue-on-error: true[\s\S]*?run: npm audit --audit-level=moderate/);
  assert.match(frontendCi, /if: always\(\)[\s\S]*?AUDIT_OUTCOME: \$\{\{ steps\.dependency_audit\.outcome \}\}/);
  assert.match(frontendCi, /if \[ "\$AUDIT_OUTCOME" != "success" \ ]; then[\s\S]*?exit 1/);
});

test("security and Vite workflows run the dependency audit directly", () => {
  assert.match(securityCi, /run: npm audit --audit-level=moderate/);
  assert.match(viteCi, /run: npm audit --audit-level=moderate/);
});

test("CI workflows do not recommend force-fixing or suppressing the dependency audit", () => {
  for (const [name, source] of Object.entries(workflowSources)) {
    assert.doesNotMatch(source, /npm audit fix --force/, name + " must not force a breaking dependency downgrade");
    assert.doesNotMatch(source, /continue-on-error:\s*true[\s\S]{0,180}npm audit --audit-level=moderate[\s\S]{0,180}(?!Enforce dependency audit result)/, name + " must not silently ignore audit failures");
  }
});

test("new regression branch receives all three relevant push workflows", async () => {
  const expectedBranch = "fix/phase-4m4-picomatch-regression-tests";
  for (const [name, source] of Object.entries(workflowSources)) {
    const workflow = await parseWorkflow(source, name);
    assert.ok(
      workflow.on?.push?.branches?.includes(expectedBranch),
      name + " must run when the isolated regression branch receives a commit",
    );
  }
});

test("security and Vite regression workflows include security test paths for push and pull requests", async () => {
  for (const [name, source] of [
    ["security-regression.yml", securityCi],
    ["vite-security-remediation.yml", viteCi],
  ]) {
    const workflow = await parseWorkflow(source, name);
    assert.ok(
      workflow.on?.push?.paths?.includes("tests/security/**"),
      name + " must run when security regression tests change on push",
    );
    assert.ok(
      workflow.on?.pull_request?.paths?.includes("tests/security/**"),
      name + " must run when security regression tests change in a pull request",
    );
    assert.ok(
      workflow.on?.pull_request?.branches?.includes("main"),
      name + " must validate pull requests targeting main",
    );
  }
});
