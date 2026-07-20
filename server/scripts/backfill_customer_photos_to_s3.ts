/**
 * One-off backfill: migrate legacy customer profile photos out of the
 * users.default_location jsonb blob into object storage + users.profile_photo_url.
 *
 * Before migration 0159 the customer profile photo was stored as a base64
 * `data:` URL under the `_profilePhotoDataUrl` key inside default_location,
 * bloating the users row (40–90 kB each). This script finds every row that
 * still carries that key, uploads the decoded image to S3 via the same
 * persistUploadedImage path the app now uses, writes the resulting
 * `/uploads/customer-avatars/<file>` path to profile_photo_url, and strips the
 * key from default_location.
 *
 * Safe to run repeatedly — rows already migrated no longer have the key. Runs
 * one row per transaction; a single bad row is logged and skipped, not fatal.
 *
 * DRY-RUN BY DEFAULT. Prints what it would do and writes nothing unless --apply.
 *
 * Run (dry run):
 *   DATABASE_URL='<url>' npx tsx server/scripts/backfill_customer_photos_to_s3.ts
 * Apply:
 *   DATABASE_URL='<url>' npx tsx server/scripts/backfill_customer_photos_to_s3.ts --apply
 */

import path from "path";

import { sql as drizzleSql } from "drizzle-orm";

import { db, pool } from "../db";
import { decodeImageDataUrlToBuffer, persistUploadedImage } from "../lib/imageUpload";

const CUSTOMER_PROFILE_PHOTO_KEY = "_profilePhotoDataUrl";
const customerAvatarUploadsDir = path.join(process.cwd(), "server/uploads/customer-avatars");

async function main() {
  const apply = process.argv.slice(2).includes("--apply");
  console.log(`[backfill-photos] ${apply ? "APPLY" : "DRY RUN"} — scanning users.default_location…`);

  const result: any = await db.execute(drizzleSql`
    SELECT id, default_location
    FROM users
    WHERE default_location ? ${CUSTOMER_PROFILE_PHOTO_KEY}
  `);
  const rows: Array<{ id: string; default_location: Record<string, unknown> }> = result.rows ?? result;

  console.log(`[backfill-photos] ${rows.length} row(s) with an embedded photo.`);

  let migrated = 0;
  let skipped = 0;

  for (const row of rows) {
    const location = (row.default_location ?? {}) as Record<string, unknown>;
    const { [CUSTOMER_PROFILE_PHOTO_KEY]: rawPhoto, ...locationOnly } = location;
    const dataUrl = typeof rawPhoto === "string" ? rawPhoto.trim() : "";

    const buffer = dataUrl ? decodeImageDataUrlToBuffer(dataUrl) : null;
    if (!buffer) {
      console.warn(`[backfill-photos] user ${row.id}: unreadable photo value — stripping key only.`);
      if (apply) {
        const nextLocation = Object.keys(locationOnly).length > 0 ? locationOnly : null;
        await db.execute(drizzleSql`
          UPDATE users SET default_location = ${nextLocation ? drizzleSql`${JSON.stringify(nextLocation)}::jsonb` : drizzleSql`NULL`}
          WHERE id = ${row.id}
        `);
      }
      skipped++;
      continue;
    }

    if (!apply) {
      console.log(`[backfill-photos] would migrate user ${row.id} (${buffer.length} bytes).`);
      migrated++;
      continue;
    }

    try {
      const persisted = await persistUploadedImage(buffer, customerAvatarUploadsDir);
      const photoUrl = `/uploads/customer-avatars/${persisted.filename}`;
      const nextLocation = Object.keys(locationOnly).length > 0 ? locationOnly : null;

      await db.execute(drizzleSql`
        UPDATE users
        SET profile_photo_url = ${photoUrl},
            default_location = ${nextLocation ? drizzleSql`${JSON.stringify(nextLocation)}::jsonb` : drizzleSql`NULL`}
        WHERE id = ${row.id}
      `);
      console.log(`[backfill-photos] user ${row.id} → ${photoUrl}`);
      migrated++;
    } catch (err: any) {
      console.error(`[backfill-photos] user ${row.id}: upload failed — ${err?.message || err}`);
      skipped++;
    }
  }

  console.log(`[backfill-photos] done. migrated=${migrated} skipped=${skipped} (${apply ? "APPLIED" : "dry run"}).`);
  await pool.end();
}

main().catch(async (err) => {
  console.error("[backfill-photos] fatal:", err);
  await pool.end().catch(() => {});
  process.exit(1);
});
