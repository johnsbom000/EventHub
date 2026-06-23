import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * AI reply assistant (Pro-gated, metered) — migration 0136.
 *
 * Adds:
 *  - vendor_accounts.ai_replies_enabled    (feature toggle, opt-in, default false)
 *  - vendor_accounts.ai_overage_enabled    (pay-as-you-go, opt-out, default true)
 *  - vendor_accounts.ai_overage_subscription_item_id (Stripe metered item)
 *  - vendor_faq_documents                  (one active FAQ PDF per vendor)
 *  - ai_reply_usage                        (one row per generated draft → credit meter + overage billing)
 *
 * Idempotent: ADD COLUMN IF NOT EXISTS + CREATE TABLE/INDEX IF NOT EXISTS.
 */
export async function up() {
  await db.execute(sql`
    ALTER TABLE IF EXISTS vendor_accounts
      ADD COLUMN IF NOT EXISTS ai_replies_enabled boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS ai_overage_enabled boolean NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS ai_overage_subscription_item_id text
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS vendor_faq_documents (
      id                 varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      vendor_account_id  varchar NOT NULL REFERENCES vendor_accounts(id) ON DELETE CASCADE,
      storage_url        text NOT NULL,
      original_filename  text,
      extracted_text     text NOT NULL,
      char_count         integer NOT NULL DEFAULT 0,
      page_count         integer,
      created_at         timestamptz NOT NULL DEFAULT now(),
      updated_at         timestamptz NOT NULL DEFAULT now(),
      deleted_at         timestamptz
    )
  `);

  // One active FAQ per vendor (soft-deleted rows excluded).
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS vendor_faq_documents_one_active_per_vendor_idx
      ON vendor_faq_documents (vendor_account_id)
      WHERE deleted_at IS NULL
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ai_reply_usage (
      id                 varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      vendor_account_id  varchar NOT NULL REFERENCES vendor_accounts(id) ON DELETE CASCADE,
      booking_id         varchar,
      input_tokens       integer NOT NULL,
      output_tokens      integer NOT NULL,
      replies_returned   integer NOT NULL,
      is_overage         boolean NOT NULL DEFAULT false,
      created_at         timestamptz NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS ai_reply_usage_vendor_created_idx
      ON ai_reply_usage (vendor_account_id, created_at)
  `);

  console.log("[0136] vendor AI reply columns + vendor_faq_documents + ai_reply_usage added.");
}

export async function down() {
  await db.execute(sql`DROP INDEX IF EXISTS ai_reply_usage_vendor_created_idx`);
  await db.execute(sql`DROP TABLE IF EXISTS ai_reply_usage`);
  await db.execute(sql`DROP INDEX IF EXISTS vendor_faq_documents_one_active_per_vendor_idx`);
  await db.execute(sql`DROP TABLE IF EXISTS vendor_faq_documents`);
  await db.execute(sql`
    ALTER TABLE IF EXISTS vendor_accounts
      DROP COLUMN IF EXISTS ai_replies_enabled,
      DROP COLUMN IF EXISTS ai_overage_enabled,
      DROP COLUMN IF EXISTS ai_overage_subscription_item_id
  `);
}
