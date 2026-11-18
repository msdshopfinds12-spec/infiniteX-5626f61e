import test from "node:test";
import assert from "node:assert/strict";
import { evaluateAuditExit, summarizeAudit } from "./dependency-policy.mjs";

test("passes when no high or critical findings exist", () => {
  const report = summarizeAudit({
    metadata: { vulnerabilities: { info: 0, low: 1, moderate: 2, high: 0, critical: 0, total: 3 } },
    vulnerabilities: {},
  });
  assert.equal(report.policy.blocking, false);
  assert.equal(evaluateAuditExit(report, 0), 0);
});

test("blocks high severity findings", () => {
  const report = summarizeAudit({
    metadata: { vulnerabilities: { high: 1, critical: 0, total: 1 } },
    vulnerabilities: {
      example: { severity: "high", isDirect: false, range: "<4.1.0", fixAvailable: false, via: ["GHSA-example"] },
    },
  });
  assert.equal(report.policy.blocking, true);
  assert.equal(report.findings[0].name, "example");
  assert.equal(report.findings[0].fixAvailable, false);
  assert.equal(evaluateAuditExit(report, 1), 1);
});

test("blocks critical findings even if high is zero", () => {
  const report = summarizeAudit({
    metadata: { vulnerabilities: { high: 0, critical: 1, total: 1 } },
    vulnerabilities: { criticalPackage: { severity: "critical", via: [] } },
  });
  assert.equal(report.policy.blocking, true);
  assert.equal(evaluateAuditExit(report, 1), 1);
});

test("normalizes advisory objects without leaking arbitrary object shapes", () => {
  const report = summarizeAudit({
    metadata: { vulnerabilities: { total: 1 } },
    vulnerabilities: {
      sample: {
        severity: "moderate",
        via: [{ title: "Advisory title", url: "https://example.invalid/advisory", range: "<2.0.0" }],
      },
    },
  });
  assert.deepEqual(report.findings[0].via, [{
    title: "Advisory title",
    url: "https://example.invalid/advisory",
    range: "<2.0.0",
  }]);
});

test("treats an unexpected audit command failure as an execution error", () => {
  const report = summarizeAudit({ metadata: { vulnerabilities: { total: 0 } }, vulnerabilities: {} });
  assert.equal(evaluateAuditExit(report, 2), 2);
});
