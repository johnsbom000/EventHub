import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Removes 'deposit_required' and 'deposit_percentage' from all stored
 * cancellation policy JSONB snapshots.
 *
 * These fields existed in the old CancellationPolicy model where a
 * "non-refundable deposit" was calculated as a percentage of the booking
 * total and deducted from refunds at cancellation time.
 *
 * Under the new model, the security deposit is:
 *   - A fixed-amount separate Stripe PaymentIntent (not a percentage)
 *   - Always fully refunded on customer cancellation regardless of tier
 *   - Only withheld after admin review of a vendor damage claim
 *
 * Affected columns:
 *   bookings.cancellation_policy_snapshot  (JSONB)
 *   vendor_listings.cancellation_policy_override  (JSONB)
 *
 * Safe to run against production:
 *   - The #- operator removes a key if present; a no-op if already absent.
 *   - Wrapped in a transaction so both tables succeed or both roll back.
 */
export async function up() {
  await db.execute(sql`
    BEGIN;

    -- Strip from booking snapshots
    UPDATE bookings
    SET cancellation_policy_snapshot =
      cancellation_policy_snapshot
        #- '{deposit_required}'
        #- '{deposit_percentage}'
    WHERE cancellation_policy_snapshot IS NOT NULL;

    -- Strip from listing overrides
    UPDATE vendor_listings
    SET cancellation_policy_override =
      cancellation_policy_override
        #- '{deposit_required}'
        #- '{deposit_percentage}'
    WHERE cancellation_policy_override IS NOT NULL;

    COMMIT;
  `);

  // Drop the now-unused columns from vendor_cancellation_policies.
  // These stored the legacy "non-refundable deposit percentage" concept.
  // Security deposits are now a fixed-amount separate Stripe charge.
  await db.execute(sql`
    ALTER TABLE vendor_cancellation_policies
      DROP COLUMN IF EXISTS deposit_required,
      DROP COLUMN IF EXISTS deposit_percentage;
  `);

  console.log("[0076] Removed deposit_required / deposit_percentage from all cancellation policy JSONB and table columns.");
}
