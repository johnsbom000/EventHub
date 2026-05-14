import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Adds 'booking' and 'security_deposit' to the payment_type enum.
 *
 * The old values ('deposit', 'final', 'installment') are left in place — PostgreSQL
 * does not support removing enum values without a full type rebuild, and existing
 * payment rows still reference 'deposit'. Those rows will be migrated to 'booking'
 * in a later migration once the new checkout flow is live and confirmed stable.
 *
 * New semantics:
 *   booking          — the full booking total (base price + add-ons + platform fee)
 *   security_deposit — a fixed-amount hold collected at checkout, held in the
 *                      EventHub platform account, refunded 48h post-event if no
 *                      damage claim is filed
 *
 * Safe to run against production:
 *   - Adding enum values is non-destructive.
 *   - Idempotent: DO $$ block guards prevent errors on re-run.
 */
export async function up() {
  await db.execute(sql`
    DO $$
    BEGIN
      ALTER TYPE payment_type ADD VALUE IF NOT EXISTS 'booking';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END$$;
  `);

  await db.execute(sql`
    DO $$
    BEGIN
      ALTER TYPE payment_type ADD VALUE IF NOT EXISTS 'security_deposit';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END$$;
  `);

  console.log("[0075] Added 'booking' and 'security_deposit' to payment_type enum.");
}
