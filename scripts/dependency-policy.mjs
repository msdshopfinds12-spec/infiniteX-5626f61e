#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export function summarizeAudit(audit) {
  const vulnerabilities = audit?.metadata?.vulnerabilities ?? {};
  const counts = {
    info: Number(vulnerabilities.info ?? 0),
    low: Number(vulnerabilities.low ?? 0),
    moderate: Number(vulnerabilities.moderate ?? 0),
    high: Number(vulnerabilities.high ?? 0),
    critical: Number(vulnerabilities.critical ?? 0),
    total: Number(vulnerabilities.total ?? 0),
  };
  const findings = Object.entries(audit?.vulnerabilities ?? {}).map(([name, item]) => ({
    name,
    severity: item.severity ?? "unknown",
    direct: Boolean(item.isDirect),
    range: item.range ?? null,
    fixAvailable: item.fixAvailable ?? false,
    via: (item.via ?? []).map((entry) =>
      typeof entry === "string" ? entry : {
        title: entry.title ?? "Untitled advisory",
        url: entry.url ?? null,
        range: entry.range ?? null,
      }),
  })).sort((a, b) => a.severity.localeCompare(b.severity) || a.name.localeCompare(b.name));
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: "npm audit --json",
    counts,
    findings,
    policy: {
      blockingSeverities: ["high", "critical"],
      blocking: counts.high > 0 || counts.critical > 0,
      note: "This report does not establish exploitability in the application. Review dependency paths and runtime exposure.",
    },
  };
}

function parseJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("npm audit did not return a JSON document.");
  return JSON.parse(text.slice(start, end + 1));
}

function main() {
  const args = process.argv.slice(2);
  const outputIndex = args.indexOf("--output");
  const outputPath = outputIndex >= 0 ? args[outputIndex + 1] : null;
  const inputIndex = args.indexOf("--input");
  let raw;
  let commandStatus = 0;

  if (inputIndex >= 0) {
    if (!args[inputIndex + 1]) throw new Error("--input requires a file path.");
    raw = readFileSync(resolve(args[inputIndex + 1]), "utf8");
  } else {
    const result = spawnSync("npm", ["audit", "--json"], {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      shell: false,
    });
    raw = result.stdout ?? "";
    commandStatus = result.status ?? 1;
    if (!raw.trim()) {
      process.stderr.write(result.stderr || "npm audit returned no output.\n");
      process.exitCode = 2;
      return;
    }
  }

  const report = summarizeAudit(parseJson(raw));
  const rendered = JSON.stringify(report, null, 2) + "\n";
  if (outputPath) writeFileSync(resolve(outputPath), rendered, { encoding: "utf8", flag: "w" });
  process.stdout.write(rendered);
  if (report.policy.blocking) {
    process.stderr.write("BLOCKED: high or critical dependency vulnerabilities remain.\n");
    process.exitCode = 1;
  } else if (commandStatus !== 0 && report.counts.total > 0) {
    process.stderr.write("BLOCKED: npm audit returned a non-zero status. Review the report.\n");
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(`Dependency policy error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 2;
}
