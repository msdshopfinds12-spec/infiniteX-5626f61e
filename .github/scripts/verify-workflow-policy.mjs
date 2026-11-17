import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const workflowDir = new URL("../../.github/workflows/", import.meta.url);
const entries = await readdir(workflowDir, { withFileTypes: true });
const files = entries
  .filter((entry) => entry.isFile() && /\\.ya?ml$/i.test(entry.name))
  .map((entry) => entry.name)
  .sort();

const violations = [];

if (files.length === 0) {
  violations.push("No GitHub Actions workflow files were found.");
}

for (const file of files) {
  const source = await readFile(new URL(file, workflowDir), "utf8");
  const lines = source.split(/\\r?\\n/);
  const report = (line, message) => {
    violations.push(`${file}:${line}: ${message}`);
  };

  if (!/^permissions:\s*\\n/m.test(source)) {
    report(1, "Declare workflow-level least-privilege permissions.");
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lineNumber = index + 1;

    if (/^\\s*permissions:\\s*(?:write-all)?\\s*$/i.test(line) && /write-all/i.test(line)) {
      report(lineNumber, "Do not use write-all permissions.");
    }

    const permission = line.match(/^\\s+([a-z_]+):\\s*(read|write|none)\\s*$/i);
    if (permission?.[2].toLowerCase() === "write") {
      report(lineNumber, `Permission "${permission[1]}" is write-enabled; require explicit security review.`);
    }

    const action = line.match(/^\\s*uses:\\s*([^\\s#]+)\\s*$/);
    if (action) {
      const reference = action[1];
      if (!reference.startsWith("./") && !/@[a-f0-9]{40}$/i.test(reference)) {
        report(lineNumber, `Action "${reference}" is not pinned to a full 40-character commit SHA.`);
      }

      if (/^actions\\/checkout@/i.test(reference)) {
        const stepWindow = lines.slice(index, Math.min(lines.length, index + 9)).join("\\n");
        if (!/persist-credentials:\\s*false/.test(stepWindow)) {
          report(lineNumber, "actions/checkout must set persist-credentials: false.");
        }
      }
    }
  }

  const jobLines = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => /^  [a-zA-Z0-9_-]+:\\s*(?:#.*)?$/.test(line));
  for (const job of jobLines) {
    const nextJob = jobLines.find((candidate) => candidate.index > job.index);
    const block = lines.slice(job.index, nextJob?.index ?? lines.length).join("\\n");
    if (!/^    timeout-minutes:\\s*[1-9][0-9]*\\s*$/m.test(block)) {
      report(job.index + 1, "Each job must define a finite timeout-minutes value.");
    }
  }
}

if (violations.length > 0) {
  console.error("CI workflow policy failed:");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exitCode = 1;
} else {
  console.log(`CI workflow policy passed for ${files.length} workflow(s).`);
}
