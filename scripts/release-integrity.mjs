import { createHash } from "node:crypto";
import {
  lstat,
  open,
  readFile,
  readdir,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MANIFEST_NAME = "SHA256SUMS.txt";

function normalizeRelativePath(value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.includes("\\") ||
    value.includes("\n") ||
    value.includes("\r") ||
    value.startsWith("/")
  ) {
    throw new Error(`Unsafe artifact path: ${JSON.stringify(value)}`);
  }

  const segments = value.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new Error(`Unsafe artifact path: ${JSON.stringify(value)}`);
  }

  return segments.join("/");
}

async function listArtifactFiles(root) {
  const rootInfo = await lstat(root);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
    throw new Error(`Artifact root must be a real directory: ${root}`);
  }

  const result = [];

  async function visit(directory, prefix = "") {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name, "en"));

    for (const entry of entries) {
      const relative = normalizeRelativePath(
        prefix ? `${prefix}/${entry.name}` : entry.name,
      );
      const absolute = path.join(directory, entry.name);
      const info = await lstat(absolute);

      if (info.isSymbolicLink()) {
        throw new Error(`Symbolic links are not permitted in artifacts: ${relative}`);
      }
      if (info.isDirectory()) {
        await visit(absolute, relative);
      } else if (info.isFile()) {
        if (relative !== MANIFEST_NAME) result.push({ absolute, relative });
      } else {
        throw new Error(`Unsupported artifact entry: ${relative}`);
      }
    }
  }

  await visit(root);
  return result.sort((a, b) => a.relative.localeCompare(b.relative, "en"));
}

function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

export async function createManifest(rootDirectory = "dist") {
  const root = path.resolve(rootDirectory);
  const manifestPath = path.join(root, MANIFEST_NAME);
  const files = await listArtifactFiles(root);
  const lines = [];

  for (const file of files) {
    lines.push(`${sha256(await readFile(file.absolute))}  ${file.relative}`);
  }

  const handle = await open(manifestPath, "wx", 0o644);
  try {
    await handle.writeFile(lines.length ? `${lines.join("\n")}\n` : "", "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }

  return { manifestPath, fileCount: files.length };
}

export async function verifyManifest(rootDirectory = "dist") {
  const root = path.resolve(rootDirectory);
  const manifestPath = path.join(root, MANIFEST_NAME);
  const manifestInfo = await lstat(manifestPath);

  if (!manifestInfo.isFile() || manifestInfo.isSymbolicLink()) {
    throw new Error("Checksum manifest must be a regular file.");
  }

  const source = await readFile(manifestPath, "utf8");
  if (source.length > 1_000_000) {
    throw new Error("Checksum manifest exceeds the 1 MB safety limit.");
  }

  const lines = source === "" ? [] : source.split("\n");
  if (lines.at(-1) === "") lines.pop();
  if (lines.some((line) => line.length === 0)) {
    throw new Error("Checksum manifest contains an empty record.");
  }

  const records = [];
  const seen = new Set();

  for (const line of lines) {
    const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
    if (!match) throw new Error(`Malformed checksum record: ${line}`);

    const relative = normalizeRelativePath(match[2]);
    if (relative === MANIFEST_NAME || seen.has(relative)) {
      throw new Error(`Duplicate or reserved manifest path: ${relative}`);
    }

    seen.add(relative);
    records.push({ digest: match[1], relative });
  }

  const sortedPaths = records.map((record) => record.relative)
    .slice()
    .sort((a, b) => a.localeCompare(b, "en"));

  if (records.some((record, index) => record.relative !== sortedPaths[index])) {
    throw new Error("Checksum records are not in canonical sorted order.");
  }

  const actualFiles = await listArtifactFiles(root);
  const actualPaths = actualFiles.map((file) => file.relative);
  const recordedPaths = records.map((record) => record.relative);

  if (
    actualPaths.length !== recordedPaths.length ||
    actualPaths.some((value, index) => value !== recordedPaths[index])
  ) {
    throw new Error("Artifact file set does not match the checksum manifest.");
  }

  for (let index = 0; index < records.length; index += 1) {
    const actualDigest = sha256(await readFile(actualFiles[index].absolute));
    if (actualDigest !== records[index].digest) {
      throw new Error(`SHA-256 mismatch: ${records[index].relative}`);
    }
  }

  return { fileCount: records.length, verified: true };
}

async function main() {
  const mode = process.argv[2];
  const root = process.argv[3] ?? "dist";

  if (mode === "create") {
    const result = await createManifest(root);
    process.stdout.write(`Created SHA-256 manifest for ${result.fileCount} files.\\n`);
    return;
  }

  if (mode === "verify") {
    const result = await verifyManifest(root);
    process.stdout.write(`Verified SHA-256 manifest for ${result.fileCount} files.\\n`);
    return;
  }

  throw new Error("Usage: node scripts/release-integrity.mjs <create|verify> [artifact-directory]");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`Release integrity check failed: ${error.message}\\n`);
    process.exitCode = 1;
  });
}
