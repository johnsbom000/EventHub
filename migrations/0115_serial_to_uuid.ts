import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Migrates 5 tables from serial integer PKs to UUID PKs, consistent with every
 * other table in the schema. None of these tables are referenced by FK from
 * other tables, so no child-column updates are required.
 *
 * Tables: vendor_referrals, founding_vendor_invites, marquee_vendor_invites,
 *         marquee_email_invites, founding_email_invites
 *
 * Strategy per table:
 *   1. Add uuid column (not null, random default)
 *   2. Drop old serial PK constraint
 *   3. Drop old id column (drops the underlying sequence too)
 *   4. Rename new column to id
 *   5. Add primary key on id
 */
export async function up() {
  const tables = [
    "vendor_referrals",
    "founding_vendor_invites",
    "marquee_vendor_invites",
    "marquee_email_invites",
    "founding_email_invites",
  ];

  for (const table of tables) {
    // Add new UUID column
    await db.execute(
      sql.raw(`ALTER TABLE ${table} ADD COLUMN id_new uuid DEFAULT gen_random_uuid() NOT NULL`)
    );
    // Drop old serial primary key
    await db.execute(
      sql.raw(`ALTER TABLE ${table} DROP CONSTRAINT ${table}_pkey`)
    );
    // Drop old serial id column (drops the sequence automatically)
    await db.execute(
      sql.raw(`ALTER TABLE ${table} DROP COLUMN id`)
    );
    // Rename new column
    await db.execute(
      sql.raw(`ALTER TABLE ${table} RENAME COLUMN id_new TO id`)
    );
    // Add primary key
    await db.execute(
      sql.raw(`ALTER TABLE ${table} ADD PRIMARY KEY (id)`)
    );
  }

  console.log("[0115] migrated 5 tables from serial to UUID primary keys");
}

export async function down() {
  const tables = [
    "vendor_referrals",
    "founding_vendor_invites",
    "marquee_vendor_invites",
    "marquee_email_invites",
    "founding_email_invites",
  ];

  for (const table of tables) {
    await db.execute(
      sql.raw(`ALTER TABLE ${table} ADD COLUMN id_old serial`)
    );
    await db.execute(
      sql.raw(`ALTER TABLE ${table} DROP CONSTRAINT ${table}_pkey`)
    );
    await db.execute(
      sql.raw(`ALTER TABLE ${table} DROP COLUMN id`)
    );
    await db.execute(
      sql.raw(`ALTER TABLE ${table} RENAME COLUMN id_old TO id`)
    );
    await db.execute(
      sql.raw(`ALTER TABLE ${table} ADD PRIMARY KEY (id)`)
    );
  }
}
