import { sql } from "drizzle-orm";
import { db } from "../server/db";

export async function up() {
  // --- Performance indexes ---

  // Vendor booking queries filtered by vendor + date (e.g. VendorBookings page)
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_bookings_vendor_account_date
      ON bookings(vendor_account_id, event_date DESC);
  `);

  // Admin booking list filtered by status (e.g. AdminDashboard booking table)
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_bookings_status_created
      ON bookings(status, created_at DESC);
  `);

  // Payout eligibility queries filtered by vendor + status
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_payments_vendor_account_status
      ON payments(vendor_account_id, status);
  `);

  // Conversation threading — messages ordered within a booking
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_messages_booking_created
      ON messages(booking_id, created_at DESC);
  `);

  // Vendor listing management filtered by account + status
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_vendor_listings_account_status
      ON vendor_listings(account_id, status);
  `);

  // --- Data integrity ---

  // Prevent duplicate referral entries for the same (referrer, referred) pair.
  // Concurrent onboardings using the same referral code could otherwise insert
  // duplicate rows since the application-level check is not atomic.
  await db.execute(sql`
    ALTER TABLE vendor_referrals
      ADD CONSTRAINT IF NOT EXISTS vendor_referrals_unique_pair
        UNIQUE (referrer_vendor_id, referred_vendor_id);
  `);

  // FK from vendor_accounts.active_profile_id → vendor_profiles.id.
  // Without this, the column can silently point to a deleted profile.
  // ON DELETE SET NULL keeps the account valid when a profile is deleted.
  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_vendor_accounts_active_profile'
          AND table_name = 'vendor_accounts'
      ) THEN
        ALTER TABLE vendor_accounts
          ADD CONSTRAINT fk_vendor_accounts_active_profile
            FOREIGN KEY (active_profile_id)
              REFERENCES vendor_profiles(id)
              ON DELETE SET NULL;
      END IF;
    END $$;
  `);

  console.log("[0117] Added 5 performance indexes, vendor_referrals unique pair constraint, and activeProfileId FK");
}
