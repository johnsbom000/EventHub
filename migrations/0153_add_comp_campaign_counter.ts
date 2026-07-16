import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Campaign counter for auto-granting complimentary ("comp") Pro to the first N
 * vendors who sign up (the Facebook-group launch: first 50 get 180 days free).
 *
 * A single row per campaign holds the total slots and how many have been claimed.
 * The provision handler claims a slot with ONE atomic conditional UPDATE
 * (`SET slots_claimed = slots_claimed + 1 WHERE slots_claimed < slots_total`),
 * which Postgres row-locks — so exactly `slots_total` vendors can ever be comped,
 * with no overshoot under concurrent signups. Flip `active` to false (or set
 * slots_total = slots_claimed) to stop the campaign instantly.
 *
 * Idempotent: CREATE TABLE IF NOT EXISTS + seed via ON CONFLICT DO NOTHING.
 */
export async function up() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS comp_campaigns (
      key           text PRIMARY KEY,
      slots_total   integer NOT NULL,
      slots_claimed integer NOT NULL DEFAULT 0,
      comp_days     integer NOT NULL DEFAULT 180,
      active        boolean NOT NULL DEFAULT true,
      created_at    timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT comp_campaigns_slots_claimed_le_total CHECK (slots_claimed <= slots_total)
    )
  `);

  // Seed the launch campaign: first 50 signups → 180 days of comp Pro.
  await db.execute(sql`
    INSERT INTO comp_campaigns (key, slots_total, comp_days, active)
    VALUES ('launch_2026', 50, 180, true)
    ON CONFLICT (key) DO NOTHING
  `);

  console.log("[0153] comp_campaigns table created + 'launch_2026' seeded (50 slots, 180 days).");
}

export async function down() {
  await db.execute(sql`DROP TABLE IF EXISTS comp_campaigns`);
  console.log("[0153] down: comp_campaigns table dropped.");
}
