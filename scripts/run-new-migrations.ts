#!/usr/bin/env node
import * as dotenv from 'dotenv';
dotenv.config();

const newMigrations = [
  '../migrations/0073_stripe_customer_id.ts',
  '../migrations/0074_dispute_type.ts',
  '../migrations/0075_payment_type_enum_additions.ts',
  '../migrations/0076_cancellation_policy_cleanup.ts',
  '../migrations/0077_drop_payment_schedules.ts',
  '../migrations/0078_dispute_cases.ts',
  '../migrations/0079_dispute_cases_withheld_amount.ts',
  '../migrations/0095_remove_legacy_payment_dispute_tables.ts',
  '../migrations/0096_payment_pi_type_unique.ts',
];

async function run() {
  for (const path of newMigrations) {
    const m = await import(path);
    if (typeof m.up !== 'function') {
      throw new Error(`Migration ${path} is missing an up() export`);
    }
    console.log(`Running ${path}...`);
    await m.up();
    console.log(`  ✓ done`);
  }
  console.log('\nAll new migrations completed successfully.');
  process.exit(0);
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
