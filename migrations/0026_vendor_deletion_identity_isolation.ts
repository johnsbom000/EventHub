import { sql } from "drizzle-orm";

import { db } from "../server/db";

const RUN_LABEL = "0026_vendor_deletion_identity_isolation";

export async function up() {
  // Step 1: Audit — record deleted vendor_accounts rows that still have user_id set.
  // Skipped gracefully if the hardening reports table doesn't exist (pre-0025 databases).
  try {
    await db.execute(sql`
      insert into vendor_identity_hardening_reports (
        run_label, issue_type, issue_key, account_ids, user_ids, emails, details
      )
      select
        ${RUN_LABEL},
        'deleted_account_retains_user_id',
        va.id,
        array[va.id],
        array[va.user_id::text],
        array[va.email],
        jsonb_build_object('deletedAt', va.deleted_at, 'userId', va.user_id)
      from vendor_accounts va
      where va.deleted_at is not null
        and va.user_id is not null;
    `);
  } catch {
    // Table doesn't exist yet — audit skipped, repair continues.
  }

  // Step 2: Data repair — sever the userId link on all existing deleted vendor_accounts rows.
  // This prevents the identity resolver from finding deleted accounts via the users chain.
  // FK children (bookings, vendor_profiles, vendor_listings) reference vendor_accounts.id,
  // not user_id, so historical data integrity is fully preserved.
  await db.execute(sql`
    update vendor_accounts
    set user_id = null
    where deleted_at is not null
      and user_id is not null;
  `);

  // Step 3: Add a functional index for the case-insensitive email resolver path,
  // scoped to active (non-deleted) accounts only.
  await db.execute(sql`
    create index if not exists idx_vendor_accounts_lower_email_active
      on vendor_accounts (lower(email))
      where deleted_at is null;
  `);
}

export async function down() {
  await db.execute(sql`
    drop index if exists idx_vendor_accounts_lower_email_active;
  `);

  await db.execute(sql`
    delete from vendor_identity_hardening_reports
    where run_label = ${RUN_LABEL};
  `);

  // NOTE: The user_id nullification on deleted rows cannot be automatically reversed.
  // If rollback is needed, inspect vendor_identity_hardening_reports
  // WHERE run_label = '0026_vendor_deletion_identity_isolation' to identify
  // the affected rows and restore them manually.
}
