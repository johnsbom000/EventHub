import { sql } from "drizzle-orm";
import { db } from "../server/db";

export async function up() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS marquee_vendor_invites (
      id               serial      PRIMARY KEY,
      token            varchar(32) NOT NULL UNIQUE,
      active           boolean     NOT NULL DEFAULT true,
      redemption_count integer     NOT NULL DEFAULT 0,
      created_at       timestamp   NOT NULL DEFAULT now()
    )
  `);

  console.log("[0103] added marquee_vendor_invites table.");
}

export async function down() {
  await db.execute(sql`DROP TABLE IF EXISTS marquee_vendor_invites`);
}
