import { sql } from "drizzle-orm";
import { db } from "../server/db";

export async function up() {
  // Rebuild payment_type enum removing legacy values (deposit, final, installment)
  await db.execute(sql`ALTER TABLE payments ALTER COLUMN payment_type TYPE text`);
  await db.execute(sql`DROP TYPE IF EXISTS payment_type`);
  await db.execute(sql`CREATE TYPE payment_type AS ENUM ('booking', 'security_deposit', 'travel_fee')`);
  // Convert any remaining dev rows with old types to 'booking'
  await db.execute(sql`
    UPDATE payments
    SET payment_type = 'booking'
    WHERE payment_type IN ('deposit', 'final', 'installment')
  `);
  await db.execute(sql`
    ALTER TABLE payments
    ALTER COLUMN payment_type TYPE payment_type
    USING payment_type::payment_type
  `);

  // Drop legacy dispute tables
  await db.execute(sql`DROP TABLE IF EXISTS dispute_admin_notes`);
  await db.execute(sql`DROP TABLE IF EXISTS booking_disputes`);
  await db.execute(sql`DROP TYPE IF EXISTS booking_dispute_status`);

  // Add missing columns to new dispute tables (IF NOT EXISTS — safe to re-run)
  await db.execute(sql`
    ALTER TABLE dispute_cases
    ADD COLUMN IF NOT EXISTS response_deadline_at timestamptz
  `);
  await db.execute(sql`
    ALTER TABLE dispute_filings
    ADD COLUMN IF NOT EXISTS is_response boolean NOT NULL DEFAULT false
  `);

  console.log("[0095] removed legacy payment enum values and dispute tables; added missing dispute columns");
}

export async function down() {
  // Restore legacy payment_type enum values
  await db.execute(sql`ALTER TABLE payments ALTER COLUMN payment_type TYPE text`);
  await db.execute(sql`DROP TYPE IF EXISTS payment_type`);
  await db.execute(sql`
    CREATE TYPE payment_type AS ENUM ('deposit', 'final', 'installment', 'booking', 'security_deposit', 'travel_fee')
  `);
  await db.execute(sql`
    ALTER TABLE payments
    ALTER COLUMN payment_type TYPE payment_type
    USING payment_type::payment_type
  `);

  // Drop added columns
  await db.execute(sql`ALTER TABLE dispute_cases DROP COLUMN IF EXISTS response_deadline_at`);
  await db.execute(sql`ALTER TABLE dispute_filings DROP COLUMN IF EXISTS is_response`);
}
