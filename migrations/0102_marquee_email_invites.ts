import { db } from "../server/db";
import { sql } from "drizzle-orm";

export async function up() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS marquee_email_invites (
      id          SERIAL PRIMARY KEY,
      email       VARCHAR(255) NOT NULL,
      sent_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      sent_by     VARCHAR(255),
      accepted    BOOLEAN      NOT NULL DEFAULT FALSE
    );

    CREATE INDEX IF NOT EXISTS marquee_email_invites_email_idx
      ON marquee_email_invites (email);
  `);
}
