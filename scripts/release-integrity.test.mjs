import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createManifest, verifyManifest } from "./release-integrity.mjs";

async function withArtifactDirectory(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), "infinitex-release-integrity-"));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("creates a deterministic manifest and verifies nested build files", async () => {
  await withArtifactDirectory(async (root) => {
    await mkdir(path.join(root, "assets"));
    await writeFile(path.join(root, "index.html"), "<main>InfiniteX</main>");
    await writeFile(path.join(root, "assets", "app.js"), "console.log('safe');");

    const created = await createManifest(root);
    assert.equal(created.fileCount, 2);

    const manifest = await readFile(path.join(root, "SHA256SUMS.txt"), "utf8");
    assert.match(manifest, /^[a-f0-9]{64}  assets\/app\.js\n[a-f0-9]{64}  index\.html\n$/);
    assert.deepEqual(await verifyManifest(root), { fileCount: 2, verified: true });
  });
});

test("rejects modified artifact content", async () => {
  await withArtifactDirectory(async (root) => {
    await writeFile(path.join(root, "index.html"), "original");
    await createManifest(root);
    await writeFile(path.join(root, "index.html"), "modified");
    await assert.rejects(() => verifyManifest(root), /SHA-256 mismatch/);
  });
});

test("rejects missing and unmanifested files", async () => {
  await withArtifactDirectory(async (root) => {
    await writeFile(path.join(root, "index.html"), "original");
    await createManifest(root);
    await writeFile(path.join(root, "extra.js"), "unexpected");
    await assert.rejects(() => verifyManifest(root), /file set does not match/);
  });
});

test("rejects symbolic links instead of following them", async () => {
  await withArtifactDirectory(async (root) => {
    const outside = path.join(os.tmpdir(), `outside-${path.basename(root)}.txt`);
    await writeFile(outside, "outside");
    await symlink(outside, path.join(root, "linked.txt"));
    try {
      await assert.rejects(() => createManifest(root), /Symbolic links are not permitted/);
    } finally {
      await rm(outside, { force: true });
    }
  });
});

test("does not overwrite an existing checksum manifest", async () => {
  await withArtifactDirectory(async (root) => {
    await writeFile(path.join(root, "index.html"), "original");
    await createManifest(root);
    await assert.rejects(() => createManifest(root), { code: "EEXIST" });
  });
});
