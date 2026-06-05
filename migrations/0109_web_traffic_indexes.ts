import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Adds indexes to the web_traffic table, which has no indexes and will slow down
 * admin analytics queries as the table grows.
 */
export async function up() {
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_web_traffic_timestamp
      ON web_traffic(timestamp DESC)
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_web_traffic_user_id
      ON web_traffic(user_id)
      WHERE user_id IS NOT NULL
  `);

  console.log("[0109] added timestamp and user_id indexes on web_traffic");
}

export async function down() {
  await db.execute(sql`DROP INDEX IF EXISTS idx_web_traffic_timestamp`);
  await db.execute(sql`DROP INDEX IF EXISTS idx_web_traffic_user_id`);
}
