import { sql } from "drizzle-orm";
import { db } from "../server/db";

export async function up() {
  // The `accepted` column in both email invite tables has always tracked
  // whether the email was *sent* successfully — not whether the recipient
  // accepted the invite. Rename to `sent_successfully` to reflect actual semantics.
  await db.execute(sql`
    ALTER TABLE marquee_email_invites
      RENAME COLUMN accepted TO sent_successfully;
  `);

  await db.execute(sql`
    ALTER TABLE founding_email_invites
      RENAME COLUMN accepted TO sent_successfully;
  `);

  console.log("[0118] Renamed accepted → sent_successfully in marquee_email_invites and founding_email_invites");
}
