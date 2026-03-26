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
