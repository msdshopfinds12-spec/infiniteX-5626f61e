import { readdir, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parseDocument } from "yaml";

const workflowDir = new URL("../../.github/workflows/", import.meta.url);
const SHA_PIN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*@[a-f0-9]{40}$/i;
const UNTRUSTED_CONTEXT = /\$\{\{\s*github\.(?:event(?:\.|}|$)|head_ref\b|ref\b|ref_name\b|actor\b|triggering_actor\b)/i;
const SECRET_CONTEXT = /\$\{\{\s*secrets\./i;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function add(issues, location, message) {
  issues.push({ location, message });
}

function checkPermissions(permissions, location, issues) {
  if (!isRecord(permissions)) {
    add(issues, location, "Permissions must be an explicit mapping; do not use write-all/read-all.");
    return;
  }
  for (const [scope, access] of Object.entries(permissions)) {
    if (!["read", "none"].includes(String(access).toLowerCase())) {
      add(issues, location + "." + scope, 'Permission must be "read" or "none"; write access requires a separately reviewed exception.');
    }
  }
}

export function analyzeWorkflow(source, filename = "workflow.yml") {
  const issues = [];
  const document = parseDocument(source, {
    version: "1.2",
    strict: true,
    uniqueKeys: true,
    prettyErrors: true
  });

  for (const error of document.errors) {
    add(issues, filename, "Invalid YAML: " + error.message);
  }
  if (document.errors.length > 0) return issues;

  let workflow;
  try {
    workflow = document.toJS({ maxAliasCount: 20 });
  } catch (error) {
    add(issues, filename, "YAML aliases could not be safely resolved: " + error.message);
    return issues;
  }

  if (!isRecord(workflow)) {
    add(issues, filename, "Workflow root must be a YAML mapping.");
    return issues;
  }

  checkPermissions(workflow.permissions, filename + ".permissions", issues);

  const triggers = workflow.on;
  if (isRecord(triggers) && Object.hasOwn(triggers, "pull_request_target")) {
    add(issues, filename + ".on.pull_request_target", "pull_request_target is prohibited by this repository policy; use pull_request with read-only permissions.");
  } else if (Array.isArray(triggers) && triggers.includes("pull_request_target")) {
    add(issues, filename + ".on", "pull_request_target is prohibited by this repository policy.");
  } else if (typeof triggers === "string" && triggers === "pull_request_target") {
    add(issues, filename + ".on", "pull_request_target is prohibited by this repository policy.");
  }

  if (!isRecord(workflow.jobs) || Object.keys(workflow.jobs).length === 0) {
    add(issues, filename + ".jobs", "Declare at least one job.");
    return issues;
  }

  for (const [jobId, job] of Object.entries(workflow.jobs)) {
    const jobLocation = filename + ".jobs." + jobId;
    if (!isRecord(job)) {
      add(issues, jobLocation, "Each job must be a YAML mapping.");
      continue;
    }

    checkPermissions(job.permissions, jobLocation + ".permissions", issues);

    if (!Number.isInteger(job["timeout-minutes"]) || job["timeout-minutes"] < 1 || job["timeout-minutes"] > 60) {
      add(issues, jobLocation + ".timeout-minutes", "Each job must set a finite timeout from 1 to 60 minutes.");
    }

    if (!Array.isArray(job.steps) || job.steps.length === 0) {
      add(issues, jobLocation + ".steps", "Each job must define at least one step.");
      continue;
    }

    for (let index = 0; index < job.steps.length; index += 1) {
      const step = job.steps[index];
      const stepLocation = jobLocation + ".steps[" + index + "]";
      if (!isRecord(step)) {
        add(issues, stepLocation, "Each step must be a YAML mapping.");
        continue;
      }

      if (typeof step.uses === "string") {
        const action = step.uses.trim();
        const isLocalAction = action.startsWith("./") && !action.includes("..");
        if (!isLocalAction && !SHA_PIN.test(action)) {
          add(issues, stepLocation + ".uses", 'Action "' + action + '" must be pinned to a full 40-character commit SHA.');
        }
        if (/^actions\/checkout@/i.test(action)) {
          if (!isRecord(step.with) || step.with["persist-credentials"] !== false) {
            add(issues, stepLocation + ".with.persist-credentials", "actions/checkout must explicitly set persist-credentials: false.");
          }
        }
      }

      if (Object.hasOwn(step, "run")) {
        if (typeof step.run !== "string") {
          add(issues, stepLocation + ".run", "Shell commands must be a string.");
          continue;
        }
        if (UNTRUSTED_CONTEXT.test(step.run)) {
          add(issues, stepLocation + ".run", "Do not interpolate untrusted GitHub event, ref, actor, or head_ref data directly into shell commands; pass validated data through environment variables instead.");
        }
        if (SECRET_CONTEXT.test(step.run)) {
          add(issues, stepLocation + ".run", "Do not interpolate secrets directly into shell commands; map secrets to narrowly scoped environment variables and avoid logging them.");
        }
      }
    }
  }

  return issues;
}

export async function runPolicyScan() {
  const entries = await readdir(workflowDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && /\.ya?ml$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort();

  const violations = [];
  if (files.length === 0) {
    violations.push({ location: ".github/workflows", message: "No workflow files were found." });
  }

  for (const file of files) {
    const source = await readFile(new URL(file, workflowDir), "utf8");
    violations.push(...analyzeWorkflow(source, file));
  }

  if (violations.length > 0) {
    console.error("CI workflow policy failed:");
    for (const issue of violations) console.error("- " + issue.location + ": " + issue.message);
    process.exitCode = 1;
    return false;
  }

  console.log("CI workflow policy passed for " + files.length + " workflow(s).");
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runPolicyScan();
}
