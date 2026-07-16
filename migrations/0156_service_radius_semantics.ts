import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Service-radius semantics redesign.
 *
 * The service radius now means only "the area a vendor is willing to serve"
 * (which drives search visibility). Fees are configured separately:
 *   - servesOutsideRadius: will the vendor take events beyond the radius?
 *   - travel_fee_* columns: the UNIFIED inside-radius fee config for BOTH travel
 *     (Service) and delivery (Rental/Catering). travel_fee_type 'flat' → auto
 *     line item; 'variable' (or legacy 'per_mile'/'per_hour') → vendor proposes
 *     after booking.
 *
 * bookings.fee_proposal_pending is the single source of truth for "a post-booking
 * fee proposal is expected here" (outside-served OR inside-varies) and drives
 * requiresVendorConfirmation. outside_service_radius stays purely geographic.
 *
 * Idempotent: ADD COLUMN IF NOT EXISTS + guarded backfills. travel_fee_type is a
 * free-text column, so no enum change is needed — this migration is transaction-safe.
 */
export async function up() {
  // 1. New columns
  await db.execute(sql`
    ALTER TABLE IF EXISTS vendor_listings
      ADD COLUMN IF NOT EXISTS serves_outside_radius boolean NOT NULL DEFAULT false
  `);
  await db.execute(sql`
    ALTER TABLE IF EXISTS bookings
      ADD COLUMN IF NOT EXISTS fee_proposal_pending boolean NOT NULL DEFAULT false
  `);

  // 2. Backfill serves_outside_radius from the old travel_offered overload.
  //    (Historically travel_offered === true meant "no hard radius boundary".)
  //    MUST run before the delivery→travel backfill below, which sets
  //    travel_offered = true and would otherwise pollute this signal.
  await db.execute(sql`
    UPDATE vendor_listings
      SET serves_outside_radius = travel_offered
      WHERE serves_outside_radius = false AND travel_offered = true
  `);

  // 3. Backfill legacy flat delivery fees into the unified travel_fee_* columns,
  //    but only when the travel columns are empty (never clobber a Service
  //    listing's travel config). delivery_fee_* columns are kept physically.
  await db.execute(sql`
    UPDATE vendor_listings
      SET travel_fee_enabled = true,
          travel_fee_type = 'flat',
          travel_fee_amount_cents = delivery_fee_amount_cents,
          travel_offered = true
      WHERE delivery_fee_enabled = true
        AND delivery_fee_amount_cents IS NOT NULL
        AND (travel_fee_enabled = false OR travel_fee_enabled IS NULL)
  `);

  // 4. Normalize legacy variable travel-fee types to the new canonical 'variable'.
  await db.execute(sql`
    UPDATE vendor_listings
      SET travel_fee_type = 'variable'
      WHERE travel_fee_type IN ('per_mile', 'per_hour')
  `);

  // 5. Preserve confirmation behavior for still-open outside-radius bookings.
  //    Previously the payment-success path forced these pending via
  //    outside_service_radius; now it reads fee_proposal_pending.
  await db.execute(sql`
    UPDATE bookings
      SET fee_proposal_pending = true
      WHERE outside_service_radius = true
        AND status IN ('pending', 'confirmed')
  `);

  console.log(
    "[0156] service-radius semantics: added serves_outside_radius + fee_proposal_pending; backfilled serve-outside, delivery→travel fee, variable type, open-booking proposals.",
  );
}

export async function down() {
  await db.execute(sql`ALTER TABLE IF EXISTS bookings DROP COLUMN IF EXISTS fee_proposal_pending`);
  await db.execute(sql`ALTER TABLE IF EXISTS vendor_listings DROP COLUMN IF EXISTS serves_outside_radius`);
  console.log("[0156] down: dropped serves_outside_radius + fee_proposal_pending.");
}
