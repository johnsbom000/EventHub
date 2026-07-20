import { sql } from "drizzle-orm";

import { db } from "../server/db";

/**
 * Add users.profile_photo_url — a dedicated column for the customer profile
 * photo, replacing the base64 `_profilePhotoDataUrl` data URL that used to be
 * packed inside the users.default_location jsonb blob.
 *
 * Storing a full image as base64 inside a hot-path jsonb column bloated every
 * users row (40–90 kB each) and every `SELECT` over users (e.g. the
 * /api/customer/me session-hydration read). The photo now goes through the
 * same S3 path as vendor/listing images (persistUploadedImage → object
 * storage) and only a short `/uploads/customer-avatars/<file>` path is stored
 * here; reads resolve it to a CDN URL via resolveStoredUploadPath.
 *
 * Nullable, no default, no backfill needed to be safe. The single legacy row
 * that still carries the inline base64 is migrated out of default_location by
 * server/scripts/backfill_customer_photos_to_s3.ts (run once post-deploy);
 * until then the read path falls back to the legacy value, so this migration
 * is non-breaking on its own.
 *
 * Idempotent: ADD COLUMN IF NOT EXISTS.
 */
export async function up() {
  await db.execute(sql`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS profile_photo_url text
  `);

  console.log("[0159] Added users.profile_photo_url (customer profile photo → S3).");
}
