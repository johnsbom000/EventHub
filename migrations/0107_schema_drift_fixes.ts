import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Adds the missing FK on google_webhook_notifications.vendor_account_id.
 *
 * The other three drift fixes in this batch (shopSlug unique index, travelFeeProposals
 * pending unique index, vendorListings.parentListingId FK) already exist in the DB from
 * migrations 0088, 0070, and 0063 respectively — they were just missing from the Drizzle
 * schema definitions. Those are schema-only updates with no SQL required here.
 */
export async function up() {
  // Add FK on google_webhook_notifications.vendor_account_id → vendor_accounts(id)
  // The column exists but has no referential constraint — orphaned rows are possible.
  await db.execute(sql`
    ALTER TABLE google_webhook_notifications
    ADD CONSTRAINT fk_google_webhook_notifications_vendor_account
    FOREIGN KEY (vendor_account_id)
    REFERENCES vendor_accounts(id)
    ON DELETE CASCADE
  `);

  console.log("[0107] added FK on google_webhook_notifications.vendor_account_id");
}

export async function down() {
  await db.execute(sql`
    ALTER TABLE google_webhook_notifications
    DROP CONSTRAINT IF EXISTS fk_google_webhook_notifications_vendor_account
  `);
}
