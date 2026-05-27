import { sql } from "drizzle-orm";
import { db } from "../server/db";

export async function up() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS event_log (
      id           TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
      event_name   TEXT NOT NULL,
      actor_type   TEXT NOT NULL CHECK (actor_type IN ('vendor', 'customer', 'system')),
      actor_id     TEXT,
      session_id   TEXT,
      properties   JSONB NOT NULL DEFAULT '{}',
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_event_log_event_name
      ON event_log (event_name)
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_event_log_actor_id
      ON event_log (actor_id)
      WHERE actor_id IS NOT NULL
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_event_log_session_id
      ON event_log (session_id)
      WHERE session_id IS NOT NULL
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_event_log_created_at
      ON event_log (created_at DESC)
  `);

  console.log("[0097] created event_log table with indexes");
}

export async function down() {
  await db.execute(sql`DROP TABLE IF EXISTS event_log`);
}
