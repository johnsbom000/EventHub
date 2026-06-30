import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Add the missing foreign key on vendor_inquiries.customer_id -> users.id.
 *
 * vendor_inquiries.customer_id was a free varchar with no referential integrity,
 * unlike every other customer reference in the schema. This adds the FK so a
 * deleted user's inquiry channels are cleaned up (ON DELETE CASCADE — an inquiry
 * chat is meaningless without its customer, matching planning_boards which also
 * uses a NOT NULL customer_id with cascade).
 *
 * Idempotent:
 *  - Orphaned rows (customer_id pointing at a non-existent user) are deleted
 *    first; the FK add would otherwise fail. Such rows are already invalid.
 *  - The constraint add is guarded by a pg_constraint existence check.
 *
 * Safe to run against: any DB. Orphan deletion removes the vendor_inquiries row
 * only; any associated Stream Chat channel is already dangling and unaffected.
 */
export async function up() {
  const orphans = await db.execute(sql`
    DELETE FROM vendor_inquiries vi
    WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = vi.customer_id)
  `);
  console.log(`[0139] deleted ${orphans.rowCount ?? 0} orphaned vendor_inquiries row(s).`);

  await db.execute(sql`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'vendor_inquiries_customer_id_users_id_fk'
      ) THEN
        ALTER TABLE vendor_inquiries
          ADD CONSTRAINT vendor_inquiries_customer_id_users_id_fk
          FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE CASCADE;
      END IF;
    END $$;
  `);

  console.log("[0139] vendor_inquiries.customer_id FK -> users.id (ON DELETE CASCADE) added.");
}

export async function down() {
  // Note: the orphan deletion in up() is not reversible.
  await db.execute(sql`
    ALTER TABLE vendor_inquiries
      DROP CONSTRAINT IF EXISTS vendor_inquiries_customer_id_users_id_fk
  `);

  console.log("[0139] down: vendor_inquiries.customer_id FK dropped.");
}
