/**
 * Upload Durability Guarantee Tests
 *
 * Ensures persistUploadedFile NEVER writes a vendor upload to the ephemeral local
 * filesystem in production. When object storage isn't configured it must throw
 * (fail loudly) and leave NOTHING on disk — so a redeploy can never wipe a file
 * we told the vendor we saved. Also verifies the dev-only local fallback still works.
 *
 * Run: npx tsx tests/upload-durability.test.ts
 */

import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";

const OBJECT_STORAGE_VARS = [
  "OBJECT_STORAGE_BUCKET",
  "OBJECT_STORAGE_ENDPOINT",
  "OBJECT_STORAGE_ACCESS_KEY_ID",
  "OBJECT_STORAGE_SECRET_ACCESS_KEY",
  "OBJECT_STORAGE_PUBLIC_BASE_URL",
];

function clearObjectStorageEnv() {
  for (const v of OBJECT_STORAGE_VARS) delete process.env[v];
}

function snapshotEnv() {
  return { NODE_ENV: process.env.NODE_ENV, RAILWAY_ENVIRONMENT: process.env.RAILWAY_ENVIRONMENT };
}
function restoreEnv(s: { NODE_ENV?: string; RAILWAY_ENVIRONMENT?: string }) {
  if (s.NODE_ENV === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = s.NODE_ENV;
  if (s.RAILWAY_ENVIRONMENT === undefined) delete process.env.RAILWAY_ENVIRONMENT; else process.env.RAILWAY_ENVIRONMENT = s.RAILWAY_ENVIRONMENT;
}

async function run() {
  const { persistUploadedFile } = await import("../server/lib/imageUpload");
  const buf = Buffer.from("%PDF-1.4 durability test", "utf8");
  const faqDir = path.join(process.cwd(), "server/uploads/vendor-faq");

  // ── Production, object storage unconfigured → FAIL LOUD, write nothing ───────
  {
    const prev = snapshotEnv();
    clearObjectStorageEnv();
    process.env.NODE_ENV = "production";
    delete process.env.RAILWAY_ENVIRONMENT;

    const before = await fs.readdir(faqDir).catch(() => [] as string[]);
    await assert.rejects(
      () => persistUploadedFile(buf, "vendor-faq", { contentType: "application/pdf", ext: "pdf" }),
      /Missing OBJECT_STORAGE/,
      "production upload with no object storage must throw",
    );
    const after = await fs.readdir(faqDir).catch(() => [] as string[]);
    assert.deepEqual(after, before, "production failure must not write any file to local disk");
    console.log("✓ production + unconfigured storage: throws and writes nothing");
    restoreEnv(prev);
  }

  // ── Railway (RAILWAY_ENVIRONMENT set) even with NODE_ENV unset → FAIL LOUD ───
  {
    const prev = snapshotEnv();
    clearObjectStorageEnv();
    delete process.env.NODE_ENV;
    process.env.RAILWAY_ENVIRONMENT = "production";

    const before = await fs.readdir(faqDir).catch(() => [] as string[]);
    await assert.rejects(
      () => persistUploadedFile(buf, "vendor-faq", { contentType: "application/pdf", ext: "pdf" }),
      /Missing OBJECT_STORAGE/,
      "Railway upload with no object storage must throw even if NODE_ENV is unset",
    );
    const after = await fs.readdir(faqDir).catch(() => [] as string[]);
    assert.deepEqual(after, before, "Railway failure must not write any file to local disk");
    console.log("✓ Railway env (NODE_ENV unset): throws and writes nothing");
    restoreEnv(prev);
  }

  // ── Local dev, object storage unconfigured → local fallback writes the file ──
  {
    const prev = snapshotEnv();
    clearObjectStorageEnv();
    process.env.NODE_ENV = "development";
    delete process.env.RAILWAY_ENVIRONMENT;

    const { storagePath, filename } = await persistUploadedFile(buf, "vendor-faq", {
      contentType: "application/pdf",
      ext: "pdf",
    });
    assert.match(storagePath, /^\/uploads\/vendor-faq\/.+\.pdf$/, "dev returns a /uploads path");
    const written = path.join(faqDir, filename);
    const stat = await fs.stat(written);
    assert.ok(stat.size > 0, "dev fallback wrote the file to local disk");
    console.log("✓ development + unconfigured storage: local fallback writes the file");

    await fs.rm(written, { force: true }); // cleanup
    restoreEnv(prev);
  }

  console.log("\n✅ All upload durability tests passed.");
}

run().catch((err) => {
  console.error("\n❌ Upload durability tests failed:", err);
  process.exit(1);
});
