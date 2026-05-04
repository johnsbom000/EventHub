import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { sql as drizzleSql } from "drizzle-orm";

import { db, pool } from "../server/db";
import { runReviewPromptJob } from "../server/jobs/reviewPromptJob";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });

type BookingCandidate = {
  bookingId: string;
  eventDate: string;
  reviewPromptSent: boolean;
};

function extractRows<T = any>(result: any): T[] {
  if (Array.isArray(result)) return result as T[];
  if (Array.isArray(result?.rows)) return result.rows as T[];
  return [];
}

async function pickPastBooking(): Promise<BookingCandidate | null> {
  const cutoffDate = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const rows: any = await db.execute(drizzleSql`
    select
      b.id as "bookingId",
      b.event_date as "eventDate",
      b.review_prompt_sent as "reviewPromptSent"
    from bookings b
    join users u on u.id = b.customer_id
    where b.status not in ('cancelled', 'failed', 'expired')
      and b.event_date <= ${cutoffDate}
      and nullif(trim(coalesce(u.email, '')), '') is not null
    order by b.event_date asc, b.created_at asc
    limit 1
  `);
  return extractRows<BookingCandidate>(rows)[0] ?? null;
}

async function createSyntheticPastBooking(): Promise<BookingCandidate> {
  const usersResult: any = await db.execute(drizzleSql`
    select id, coalesce(nullif(trim(name), ''), 'Customer') as "name"
    from users
    where nullif(trim(coalesce(email, '')), '') is not null
    order by created_at asc
    limit 1
  `);
  const vendorResult: any = await db.execute(drizzleSql`
    select id, coalesce(nullif(trim(business_name), ''), 'Vendor') as "name"
    from vendor_accounts
    where deleted_at is null
    order by created_at asc
    limit 1
  `);
  const user = extractRows<{ id: string; name: string }>(usersResult)[0];
  const vendor = extractRows<{ id: string; name: string }>(vendorResult)[0];

  if (!user?.id || !vendor?.id) {
    throw new Error("Cannot create synthetic booking: missing user or vendor_account records.");
  }

  const syntheticDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const insertResult: any = await db.execute(drizzleSql`
    insert into bookings (
      customer_id,
      vendor_account_id,
      event_date,
      total_amount,
      platform_fee,
      vendor_payout,
      deposit_amount,
      status,
      payment_status,
      review_prompt_sent,
      listing_title_snapshot
    )
    values (
      ${user.id},
      ${vendor.id},
      ${syntheticDate},
      10000,
      800,
      9200,
      1000,
      'pending',
      'pending',
      false,
      'Synthetic Review Prompt Test Booking'
    )
    returning id as "bookingId", event_date as "eventDate", review_prompt_sent as "reviewPromptSent"
  `);

  const booking = extractRows<BookingCandidate>(insertResult)[0];
  if (!booking) {
    throw new Error("Failed to create synthetic booking for review prompt test.");
  }
  return booking;
}

async function readFlag(bookingId: string): Promise<boolean | null> {
  const rows: any = await db.execute(drizzleSql`
    select review_prompt_sent as "reviewPromptSent"
    from bookings
    where id = ${bookingId}
    limit 1
  `);
  const row = extractRows<{ reviewPromptSent: boolean }>(rows)[0];
  return typeof row?.reviewPromptSent === "boolean" ? row.reviewPromptSent : null;
}

async function run() {
  const existing = await pickPastBooking();
  const createdSynthetic = !existing;
  const booking = existing ?? (await createSyntheticPastBooking());

  try {
    await db.execute(drizzleSql`
      update bookings set review_prompt_sent = false where id = ${booking.bookingId}
    `);

    const before = await readFlag(booking.bookingId);
    console.log("[test-review-prompt-job] using booking:", {
      bookingId: booking.bookingId,
      eventDate: booking.eventDate,
      beforeFlag: before,
    });

    const summary = await runReviewPromptJob({
      logger: console,
    });

    const after = await readFlag(booking.bookingId);
    console.log("[test-review-prompt-job] summary:", summary);
    console.log("[test-review-prompt-job] afterFlag:", after);

    if (after !== true) {
      throw new Error("review_prompt_sent did not flip to true for the selected booking.");
    }
  } finally {
    if (createdSynthetic) {
      await db.execute(drizzleSql`
        delete from bookings where id = ${booking.bookingId}
      `);
      console.log("[test-review-prompt-job] cleaned up synthetic booking:", booking.bookingId);
    }
  }
}

run()
  .catch((error: any) => {
    console.error("[test-review-prompt-job] failed:", error?.message || error);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
