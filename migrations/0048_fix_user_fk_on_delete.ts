import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Fix ON DELETE behaviour for all foreign keys referencing users(id).
 *
 * Problem: several tables had no onDelete clause, which defaults PostgreSQL to
 * RESTRICT. This meant deleting a customer account would fail at the DB level
 * even after the application had already cancelled their bookings.
 *
 * Changes:
 *   bookings.customer_id            RESTRICT → SET NULL
 *   payments.customer_id            RESTRICT → SET NULL
 *   planning_boards.customer_id     RESTRICT → CASCADE  (boards belong to the customer)
 *   circumvention_flags.user_id     RESTRICT → SET NULL
 *   circumvention_flags.reported_by_user_id  RESTRICT → SET NULL
 *   vendor_accounts.user_id         RESTRICT → SET NULL
 *
 * Safe to run against production:
 *   - DROP CONSTRAINT + ADD CONSTRAINT is transactional in PostgreSQL.
 *   - No data is modified.
 *   - Constraint names are derived from Drizzle defaults; verified against schema.
 */
export async function up() {
  // bookings.customer_id
  await db.execute(sql`
    ALTER TABLE bookings
      DROP CONSTRAINT IF EXISTS bookings_customer_id_users_id_fk,
      ADD CONSTRAINT bookings_customer_id_users_id_fk
        FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE SET NULL;
  `);

  // payments.customer_id
  await db.execute(sql`
    ALTER TABLE payments
      DROP CONSTRAINT IF EXISTS payments_customer_id_users_id_fk,
      ADD CONSTRAINT payments_customer_id_users_id_fk
        FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE SET NULL;
  `);

  // planning_boards.customer_id — cascade: delete the boards when the customer leaves
  await db.execute(sql`
    ALTER TABLE planning_boards
      DROP CONSTRAINT IF EXISTS planning_boards_customer_id_users_id_fk,
      ADD CONSTRAINT planning_boards_customer_id_users_id_fk
        FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE CASCADE;
  `);

  // circumvention_flags.user_id
  await db.execute(sql`
    ALTER TABLE circumvention_flags
      DROP CONSTRAINT IF EXISTS circumvention_flags_user_id_users_id_fk,
      ADD CONSTRAINT circumvention_flags_user_id_users_id_fk
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
  `);

  // circumvention_flags.reported_by_user_id
  await db.execute(sql`
    ALTER TABLE circumvention_flags
      DROP CONSTRAINT IF EXISTS circumvention_flags_reported_by_user_id_users_id_fk,
      ADD CONSTRAINT circumvention_flags_reported_by_user_id_users_id_fk
        FOREIGN KEY (reported_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
  `);

  // vendor_accounts.user_id
  await db.execute(sql`
    ALTER TABLE vendor_accounts
      DROP CONSTRAINT IF EXISTS vendor_accounts_user_id_users_id_fk,
      ADD CONSTRAINT vendor_accounts_user_id_users_id_fk
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
  `);

  console.log("[0048] User FK on-delete behaviours updated.");
}

export async function down() {
  // Restore RESTRICT (the implicit default) by dropping the named constraints.
  // PostgreSQL will re-apply RESTRICT as the default when no ON DELETE is specified.
  await db.execute(sql`
    ALTER TABLE bookings
      DROP CONSTRAINT IF EXISTS bookings_customer_id_users_id_fk,
      ADD CONSTRAINT bookings_customer_id_users_id_fk
        FOREIGN KEY (customer_id) REFERENCES users(id);
  `);
  await db.execute(sql`
    ALTER TABLE payments
      DROP CONSTRAINT IF EXISTS payments_customer_id_users_id_fk,
      ADD CONSTRAINT payments_customer_id_users_id_fk
        FOREIGN KEY (customer_id) REFERENCES users(id);
  `);
  await db.execute(sql`
    ALTER TABLE planning_boards
      DROP CONSTRAINT IF EXISTS planning_boards_customer_id_users_id_fk,
      ADD CONSTRAINT planning_boards_customer_id_users_id_fk
        FOREIGN KEY (customer_id) REFERENCES users(id);
  `);
  await db.execute(sql`
    ALTER TABLE circumvention_flags
      DROP CONSTRAINT IF EXISTS circumvention_flags_user_id_users_id_fk,
      ADD CONSTRAINT circumvention_flags_user_id_users_id_fk
        FOREIGN KEY (user_id) REFERENCES users(id);
  `);
  await db.execute(sql`
    ALTER TABLE circumvention_flags
      DROP CONSTRAINT IF EXISTS circumvention_flags_reported_by_user_id_users_id_fk,
      ADD CONSTRAINT circumvention_flags_reported_by_user_id_users_id_fk
        FOREIGN KEY (reported_by_user_id) REFERENCES users(id);
  `);
  await db.execute(sql`
    ALTER TABLE vendor_accounts
      DROP CONSTRAINT IF EXISTS vendor_accounts_user_id_users_id_fk,
      ADD CONSTRAINT vendor_accounts_user_id_users_id_fk
        FOREIGN KEY (user_id) REFERENCES users(id);
  `);

  console.log("[0048] down: User FK on-delete behaviours reverted to RESTRICT.");
}
