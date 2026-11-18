#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function summarizeAudit(audit) {
  const vulnerabilities = audit?.metadata?.vulnerabilities ?? {};
  const counts = Object.fromEntries(
    ["info", "low", "moderate", "high", "critical", "total"]
      .map((key) => [key, Number(vulnerabilities[key] ?? 0)]),
  );
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
  })).sort((a, b) => a.name.localeCompare(b.name));

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: "npm audit --json --audit-level=high",
    counts,
    findings,
    policy: {
      blockingSeverities: ["high", "critical"],
      blocking: counts.high > 0 || counts.critical > 0,
      note: "This report does not establish exploitability in the application. Review dependency paths and runtime exposure.",
    },
  };
}

function parseJson(output) {
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("npm audit did not return a JSON document.");
  return JSON.parse(output.slice(start, end + 1));
}

export function evaluateAuditExit(report, commandStatus) {
  if (report.policy.blocking) return 1;
  if (commandStatus !== 0) return 2;
  return 0;
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
    const result = spawnSync("npm", ["audit", "--json", "--audit-level=high"], {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      shell: false,
    });
    if (result.error) throw result.error;
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

  const outcome = evaluateAuditExit(report, commandStatus);
  if (outcome === 1) {
    process.stderr.write("BLOCKED: high or critical dependency vulnerabilities remain.\n");
  } else if (outcome === 2) {
    process.stderr.write("ERROR: npm audit failed without a matching high/critical finding; inspect audit/network output.\n");
  }
  process.exitCode = outcome;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`Dependency policy error: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}
