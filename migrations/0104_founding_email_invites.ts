import { db } from "../server/db";
import { sql } from "drizzle-orm";

export async function up() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS founding_email_invites (
      id          SERIAL PRIMARY KEY,
      email       VARCHAR(255) NOT NULL,
      sent_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      sent_by     VARCHAR(255),
      accepted    BOOLEAN      NOT NULL DEFAULT FALSE
    );

    CREATE INDEX IF NOT EXISTS founding_email_invites_email_idx
      ON founding_email_invites (email);
  `);
}
