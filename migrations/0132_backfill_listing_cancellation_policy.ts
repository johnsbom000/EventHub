import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Backfill the cancellation policy columns from listing_data.
 *
 * Single-listing create/update/publish endpoints historically never wrote the
 * `cancellation_policy` / `cancellation_policy_days` columns — they only stored
 * the wizard's `listingData` JSON blob. Those columns are the authoritative
 * source for the booking `cancellation_policy_snapshot` and the checkout policy
 * display, so listings whose vendors picked a non-default policy were silently
 * falling back to `cancel_anytime` (full refund, any time) at booking time.
 *
 * The persistence bug is fixed in code (buildCanonicalListingColumns now writes
 * these columns on every save). This migration repairs existing rows so the
 * authoritative columns match what the vendor actually set in the wizard.
 *
 * Mirrors server/lib/cancellationPolicyPresets.ts `resolveListingPolicyColumns`:
 *  - policy: a known wizard value, else `cancel_anytime`.
 *  - days:   the wizard window (stored in listing_data.cancellationPolicyHours);
 *            only meaningful for cancel_within_hours / cancel_within_days.
 *
 * Scope: single + package_container rows only. package_item rows already get
 * their columns populated by the package endpoints. Booking snapshots are NOT
 * touched — existing bookings keep the policy disclosed to the customer at
 * checkout.
 *
 * Idempotent: only updates rows where `cancellation_policy IS NULL`, so a
 * re-run after the columns are populated is a no-op.
 */
export async function up() {
  const result: any = await db.execute(sql`
    UPDATE vendor_listings
    SET
      cancellation_policy = CASE
        WHEN listing_data->>'cancellationPolicy' IN
             ('cancel_anytime', 'cancel_within_hours', 'cancel_within_days', 'no_cancellations')
          THEN listing_data->>'cancellationPolicy'
        ELSE 'cancel_anytime'
      END,
      cancellation_policy_days = CASE
        WHEN listing_data->>'cancellationPolicy' IN ('cancel_within_hours', 'cancel_within_days')
             AND (listing_data->>'cancellationPolicyHours') ~ '^[0-9]+$'
             AND (listing_data->>'cancellationPolicyHours')::int > 0
          THEN (listing_data->>'cancellationPolicyHours')::int
        ELSE NULL
      END
    WHERE cancellation_policy IS NULL
      AND listing_type IN ('single', 'package_container')
      AND listing_data ? 'cancellationPolicy'
  `);

  const updated = (result as any)?.rowCount ?? (result as any)?.count ?? "unknown";
  console.log(`[0132] backfilled cancellation policy columns for ${updated} listing(s).`);
}

export async function down() {
  // Intentional no-op. Nulling the columns again could not distinguish a
  // backfilled value from one a vendor has since set deliberately, and would
  // re-introduce the silent full-refund-anytime bug. Leave the columns in place.
  console.log("[0132] down: no-op (backfilled policy columns are left intact).");
}
