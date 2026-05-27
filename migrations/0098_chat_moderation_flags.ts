import { sql } from "drizzle-orm";
import { db } from "../server/db";

export async function up() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS chat_moderation_flags (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      booking_id text NOT NULL,
      actor_type text NOT NULL,
      actor_id text NOT NULL,
      reason text NOT NULL,
      sample_text text,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_chat_moderation_flags_actor
    ON chat_moderation_flags (actor_type, actor_id, created_at DESC)
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_chat_moderation_flags_booking
    ON chat_moderation_flags (booking_id, created_at DESC)
  `);

  console.log("[0098] created chat_moderation_flags table and indexes");
}

export async function down() {
  await db.execute(sql`DROP TABLE IF EXISTS chat_moderation_flags`);
  console.log("[0098] dropped chat_moderation_flags table");
}
