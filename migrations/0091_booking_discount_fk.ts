import { sql } from "drizzle-orm";
import { db } from "../server/db";

export async function up() {
  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'bookings_applied_discount_id_fkey'
      ) THEN
        ALTER TABLE bookings
          ADD CONSTRAINT bookings_applied_discount_id_fkey
          FOREIGN KEY (applied_discount_id)
          REFERENCES vendor_discounts(id)
          ON DELETE SET NULL;
      END IF;
    END $$
  `);

  console.log("[0091] added FK: bookings.applied_discount_id → vendor_discounts.id ON DELETE SET NULL");
}

export async function down() {
  await db.execute(sql`
    ALTER TABLE bookings
      DROP CONSTRAINT IF EXISTS bookings_applied_discount_id_fkey
  `);
}
