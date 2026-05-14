import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Introduces the dispute case system.
 *
 * Two new tables replace the single booking_disputes row-per-booking model:
 *
 *   dispute_cases   — one per booking, tracks overall case status & resolution
 *   dispute_filings — many per case; each filing by vendor, customer, or admin
 *
 * Existing booking_disputes rows are migrated:
 *   - Each row becomes one dispute_cases row + one dispute_filings row.
 *   - dispute_admin_notes rows become admin filings inside the same case.
 *
 * booking_disputes and dispute_admin_notes are left intact (soft-deprecated)
 * so existing admin views continue to work while the new UI rolls out.
 *
 * Safe to re-run: all DDL is guarded with IF NOT EXISTS.
 */
export async function up() {
  // ── 1. dispute_cases ────────────────────────────────────────────────────────
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS dispute_cases (
      id          text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
      booking_id  text        NOT NULL UNIQUE
                               REFERENCES bookings(id) ON DELETE CASCADE,
      status      text        NOT NULL DEFAULT 'open',
      resolution  text,
      resolved_at timestamptz,
      created_at  timestamptz NOT NULL DEFAULT now(),
      updated_at  timestamptz NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS dispute_cases_status_idx
    ON dispute_cases (status, created_at DESC)
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS dispute_cases_booking_id_idx
    ON dispute_cases (booking_id)
  `);

  // ── 2. dispute_filings ──────────────────────────────────────────────────────
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS dispute_filings (
      id                      text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
      case_id                 text        NOT NULL REFERENCES dispute_cases(id) ON DELETE CASCADE,
      booking_id              text        NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      filed_by                text        NOT NULL DEFAULT 'customer',
      filer_customer_id       text        REFERENCES users(id) ON DELETE SET NULL,
      filer_vendor_account_id text        REFERENCES vendor_accounts(id) ON DELETE SET NULL,
      dispute_type            text        NOT NULL DEFAULT 'other',
      description             text        NOT NULL DEFAULT '',
      attachment_urls         text[]      NOT NULL DEFAULT '{}',
      claim_amount_cents      integer,
      created_at              timestamptz NOT NULL DEFAULT now(),
      updated_at              timestamptz NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS dispute_filings_case_id_idx
    ON dispute_filings (case_id, created_at ASC)
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS dispute_filings_booking_id_idx
    ON dispute_filings (booking_id)
  `);

  // ── 3. Migrate existing booking_disputes → cases ────────────────────────────
  await db.execute(sql`
    INSERT INTO dispute_cases (id, booking_id, status, resolution, resolved_at, created_at, updated_at)
    SELECT
      gen_random_uuid()::text,
      bd.booking_id,
      CASE
        WHEN bd.status IN ('resolved_refund', 'resolved_payout') THEN 'resolved'
        ELSE 'open'
      END,
      CASE
        WHEN bd.admin_decision IS NOT NULL
          THEN coalesce(bd.admin_notes, bd.admin_decision)
        ELSE NULL
      END,
      bd.resolved_at,
      bd.created_at,
      bd.updated_at
    FROM booking_disputes bd
    ON CONFLICT (booking_id) DO NOTHING
  `);

  // ── 4. Migrate customer filings ─────────────────────────────────────────────
  await db.execute(sql`
    INSERT INTO dispute_filings (
      id, case_id, booking_id, filed_by,
      filer_customer_id, filer_vendor_account_id,
      dispute_type, description, attachment_urls, created_at, updated_at
    )
    SELECT
      gen_random_uuid()::text,
      dc.id,
      bd.booking_id,
      'customer',
      bd.customer_id,
      bd.vendor_account_id,
      COALESCE(bd.dispute_type, 'other'),
      COALESCE(bd.details, bd.reason, ''),
      '{}',
      bd.filed_at,
      bd.updated_at
    FROM booking_disputes bd
    JOIN dispute_cases dc ON dc.booking_id = bd.booking_id
  `);

  // ── 5. Migrate vendor responses as vendor filings ───────────────────────────
  await db.execute(sql`
    INSERT INTO dispute_filings (
      id, case_id, booking_id, filed_by,
      filer_vendor_account_id,
      dispute_type, description, attachment_urls, created_at, updated_at
    )
    SELECT
      gen_random_uuid()::text,
      dc.id,
      bd.booking_id,
      'vendor',
      bd.vendor_account_id,
      'other',
      bd.vendor_response,
      '{}',
      COALESCE(bd.vendor_responded_at, bd.updated_at),
      COALESCE(bd.vendor_responded_at, bd.updated_at)
    FROM booking_disputes bd
    JOIN dispute_cases dc ON dc.booking_id = bd.booking_id
    WHERE bd.vendor_response IS NOT NULL AND trim(bd.vendor_response) <> ''
  `);

  // ── 6. Migrate dispute_admin_notes as admin filings ─────────────────────────
  await db.execute(sql`
    INSERT INTO dispute_filings (
      id, case_id, booking_id, filed_by,
      dispute_type, description, attachment_urls, created_at, updated_at
    )
    SELECT
      gen_random_uuid()::text,
      dc.id,
      bd.booking_id,
      'admin',
      'admin_note',
      dan.content,
      '{}',
      dan.created_at,
      dan.created_at
    FROM dispute_admin_notes dan
    JOIN booking_disputes bd ON bd.id = dan.dispute_id
    JOIN dispute_cases dc ON dc.booking_id = bd.booking_id
  `);

  console.log("[0078] dispute_cases + dispute_filings created. Existing disputes migrated.");
}
