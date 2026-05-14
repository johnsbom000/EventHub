#!/usr/bin/env node
import * as dotenv from 'dotenv';
import { Command } from 'commander';

const program = new Command();

dotenv.config();

const migrationModules = [
  '../migrations/0001_initial_schema_and_seed.ts',
  '../migrations/0002_add_user_default_location.ts',
  '../migrations/0003_cleanup_dummy_vendors_and_email_index.ts',
  '../migrations/0004_security_batch2_baseline.ts',
  '../migrations/0005_vendor_multi_profile_foundation.ts',
  '../migrations/0006_backfill_legacy_profile_names.ts',
  '../migrations/0007_add_vendor_google_connection.ts',
  '../migrations/0008_add_booking_google_sync_metadata.ts',
  '../migrations/0009_add_booking_time_range.ts',
  '../migrations/0010_add_google_event_mappings.ts',
  '../migrations/0011_add_booking_event_end_time.ts',
  '../migrations/0012_add_canonical_onboarding_listing_fields.ts',
  '../migrations/0013_add_booking_canonical_timing_and_snapshots.ts',
  '../migrations/0014_phase3_canonical_booking_cleanup.ts',
  '../migrations/0015_phase4_timezone_and_constraints.ts',
  '../migrations/0016_add_vendor_listings_quantity.ts',
  '../migrations/0017_listing_logistics_toggle_normalization.ts',
  '../migrations/0018_booking_snapshot_normalization.ts',
  '../migrations/0019_phase4_legacy_cleanup_integrity.ts',
  '../migrations/0020_booking_listing_fk_cleanup.ts',
  '../migrations/0021_vendor_profile_lifecycle_and_account_deletion.ts',
  '../migrations/0022_payment_and_booking_state_hardening.ts',
  '../migrations/0023_connect_express_separate_charges_transfers.ts',
  '../migrations/0024_booking_disputes_and_24h_payout_window.ts',
  '../migrations/0025_vendor_identity_backfill_and_constraint_hardening.ts',
  '../migrations/0026_vendor_deletion_identity_isolation.ts',
  '../migrations/0027_backfill_payment_stripe_connected_account.ts',
  '../migrations/0028_payout_sync_trigger.ts',
  '../migrations/0029_listing_reviews_table.ts',
  // 0030: two files share this prefix (alphabetical order, no dependency between them)
  '../migrations/0030_add_vendor_listing_takedown_columns.ts',
  '../migrations/0030_missing_indexes.ts',
  '../migrations/0031_add_whats_not_included.ts',
  // 0032: two files share this prefix (alphabetical order, no dependency between them)
  '../migrations/0032_add_review_prompt_sent.ts',
  '../migrations/0032_vendor_availability_modes.ts',
  '../migrations/0033_planning_boards.ts',
  '../migrations/0034_nullify_legacy_vendor_passwords.ts',
  // 0035: two files share this prefix (alphabetical order, no dependency between them)
  '../migrations/0035_apply_listing_status_enum.ts',
  '../migrations/0035_drop_password_columns.ts',
  '../migrations/0036_message_notification_type_safety.ts',
  '../migrations/0037_board_saved_listings_cascade.ts',
  '../migrations/0038_nullify_user_passwords.ts',
  '../migrations/0039_events_owner_and_timestamps.ts',
  '../migrations/0040_review_replies_listing_fk.ts',
  '../migrations/0041_stripe_webhook_retention.ts',
  // 0042: two files share this prefix (alphabetical order, no dependency between them)
  '../migrations/0042_drop_legacy_payment_columns.ts',
  '../migrations/0042_vendor_owner_personal_details.ts',
  '../migrations/0043_dispute_admin_notes.ts',
  '../migrations/0044_circumvention_system.ts',
  '../migrations/0045_feedback_submissions.ts',
  '../migrations/0046_drop_vendor_profile_service_type.ts',
  '../migrations/0047_listing_subcategory_detail.ts',
  // 0048: two files share this prefix (alphabetical order, no dependency between them)
  '../migrations/0048_fix_user_fk_on_delete.ts',
  '../migrations/0048_vendor_discount_system.ts',
  '../migrations/0049_date_columns_text_to_date.ts',
  '../migrations/0050_drop_review_index_column.ts',
  '../migrations/0051_rating_check_and_indexes.ts',
  '../migrations/0052_circumvention_varchar_to_enum.ts',
  '../migrations/0053_notifications_expires_at.ts',
  '../migrations/0054_backfill_booking_timing.ts',
  '../migrations/0055_i18n_language_support.ts',
  '../migrations/0056_google_watch_channels_and_dedup.ts',
  '../migrations/0057_vacation_blocks_google_sync.ts',
  '../migrations/0058_google_vacation_mappings_table.ts',
  '../migrations/0059_notification_type_google_calendar.ts',
  '../migrations/0060_add_event_timezone_to_bookings.ts',
  '../migrations/0061_email_tracking_columns.ts',
  '../migrations/0062_cancellation_policy_system.ts',
  '../migrations/0063_listing_type_and_parent.ts',
  '../migrations/0064_listing_addon_links.ts',
  '../migrations/0065_booking_items_item_type.ts',
  '../migrations/0066_add_dimension_columns.ts',
  '../migrations/0067_clear_container_inclusions.ts',
  '../migrations/0068_security_deposit.ts',
  '../migrations/0069_worker_locks.ts',
  '../migrations/0070_travel_fee_proposals.ts',
  '../migrations/0071_drop_logistics_time_columns.ts',
  '../migrations/0072_booking_timestamps_to_timestamptz.ts',
  '../migrations/0073_stripe_customer_id.ts',
  '../migrations/0074_dispute_type.ts',
  '../migrations/0075_payment_type_enum_additions.ts',
  '../migrations/0076_cancellation_policy_cleanup.ts',
  '../migrations/0077_drop_payment_schedules.ts',
  '../migrations/0078_dispute_cases.ts',
  '../migrations/0079_dispute_cases_withheld_amount.ts',
  '../migrations/0080_schema_cleanup.ts',
  '../migrations/0081_review_reply_review_id.ts',
] as const;

async function runUpMigrations() {
  for (const migrationPath of migrationModules) {
    const migration = await import(migrationPath);
    if (typeof migration.up !== 'function') {
      throw new Error(`Migration ${migrationPath} is missing an up() export`);
    }
    console.log(`Running ${migrationPath}...`);
    await migration.up();
  }
}

async function runDownMigrations() {
  for (const migrationPath of [...migrationModules].reverse()) {
    const migration = await import(migrationPath);
    if (typeof migration.down !== 'function') {
      console.log(`Skipping ${migrationPath} (no down export)`);
      continue;
    }
    console.log(`Rolling back ${migrationPath}...`);
    await migration.down();
  }
}

program
  .name('migrate')
  .description('CLI to manage database migrations')
  .version('1.0.0');

program
  .command('up')
  .description('Run migrations')
  .action(async () => {
    try {
      console.log('Running migrations...');
      await runUpMigrations();
      console.log('Migrations completed successfully');
      process.exit(0);
    } catch (error) {
      console.error('Migration failed:', error);
      process.exit(1);
    }
  });

program
  .command('down')
  .description('Rollback migrations')
  .action(async () => {
    try {
      console.log('Rolling back migrations...');
      await runDownMigrations();
      console.log('Rollback completed successfully');
      process.exit(0);
    } catch (error) {
      console.error('Rollback failed:', error);
      process.exit(1);
    }
  });

program.parse(process.argv);
