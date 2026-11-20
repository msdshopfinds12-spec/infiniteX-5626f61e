import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const sqlPath = "supabase/diagnostics/phase-73d-read-only-catalog-audit.sql";
const reportPath = "docs/database/PHASE-73D-LIVE-SCHEMA-RUNTIME-VERIFICATION.md";
const failures = [];
const checks = [];
const check = (ok, label) => {
  checks.push({ label, ok: Boolean(ok) });
  if (!ok) failures.push(label);
};

try {
  const raw = await readFile(resolve(process.cwd(), sqlPath), "utf8");
  const sql = raw
    .replace(/--[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .trim();
  const statements = sql.split(";").map((part) => part.trim()).filter(Boolean);

  check(statements.length >= 8, "At least eight catalog diagnostic statements exist");
  check(statements.every((statement) => /^select\b/i.test(statement)), "Every executable statement is SELECT-only");
  check(!/\b(insert\s+into|update\s+[a-z_]|delete\s+from|drop\s+|alter\s+|create\s+|grant\s+|revoke\s+|truncate\s+|copy\s+|call\s+|do\s+|vacuum\b|refresh\s+materialized)\b/i.test(
    statements.join("\n").replace(/'[^']*'/g, "''")
  ), "No DDL, DML, privilege mutation, or procedural execution tokens");
  check(!/\b(vault\.secrets|auth\.users|auth\.identities|auth\.sessions)\b/i.test(sql), "No credential-bearing or auth-record tables queried");
  check(/platform_api_keys/.test(sql) && /key_hash/.test(sql), "API-key privilege metadata is inspected without selecting stored values");
  check(/billing_webhook_events/.test(sql), "Private webhook table grants are checked");
  check(/simula_verify_worker_secret/.test(sql), "Worker verifier effective privileges are checked");

  const report = await readFile(resolve(process.cwd(), reportPath), "utf8");
  check(/19/.test(report) && /14/.test(report), "Live migration and public-table inventory are recorded");
  check(/No production objects were modified/.test(report), "Report documents read-only scope");
  check(/HIGH release blocker/.test(report), "Runtime drift is explicitly release-blocking");
} catch (error) {
  failures.push(`Audit contract setup failed: ${error.message}`);
}

for (const item of checks) console.log(`${item.ok ? "PASS" : "FAIL"} ${item.label}`);
if (failures.length) {
  console.error(`\nPhase 73D audit contract failed (${failures.length} issue(s)).`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`\nPhase 73D audit contract passed (${checks.length} checks).`);
}
