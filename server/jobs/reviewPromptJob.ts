import { sql as drizzleSql } from "drizzle-orm";

import { db } from "../db";
import { sendReviewPromptEmail } from "../email";

type ReviewPromptRow = {
  bookingId: string;
  eventDate: string;
  listingTitle: string;
  customerEmail: string;
  customerName: string;
  vendorName: string;
};

type LoggerLike = Pick<Console, "log" | "warn">;

export type ReviewPromptJobResult = {
  cutoffDate: string;
  eligibleCount: number;
  sentCount: number;
  markedCount: number;
  skippedCount: number;
  failedCount: number;
};

function extractRows<T = any>(result: any): T[] {
  if (Array.isArray(result)) return result as T[];
  if (Array.isArray(result?.rows)) return result.rows as T[];
  return [];
}

export async function runReviewPromptJob(options?: {
  serverUrl?: string;
  limit?: number;
  logger?: LoggerLike;
}): Promise<ReviewPromptJobResult> {
  const logger = options?.logger ?? console;
  const serverUrl = (options?.serverUrl || process.env.SERVER_URL || "http://localhost:5001").replace(/\/$/, "");
  const limit = Number.isFinite(options?.limit) ? Math.max(1, Math.floor(options!.limit!)) : 200;
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const cutoffDate = cutoff.toISOString().split("T")[0];

  const rows: any = await db.execute(drizzleSql`
    select
      b.id             as "bookingId",
      b.event_date     as "eventDate",
      coalesce(b.listing_title_snapshot, '') as "listingTitle",
      u.email          as "customerEmail",
      u.name           as "customerName",
      va.business_name as "vendorName"
    from bookings b
    join users u            on u.id  = b.customer_id
    join vendor_accounts va on va.id = b.vendor_account_id
    where b.review_prompt_sent = false
      and b.status not in ('cancelled', 'failed', 'expired')
      and b.event_date <= ${cutoffDate}
    order by b.event_date desc
    limit ${limit}
  `);

  const eligible = extractRows<ReviewPromptRow>(rows);
  if (eligible.length === 0) {
    return {
      cutoffDate,
      eligibleCount: 0,
      sentCount: 0,
      markedCount: 0,
      skippedCount: 0,
      failedCount: 0,
    };
  }

  let sentCount = 0;
  let markedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const row of eligible) {
    try {
      if (!row.customerEmail) {
        // No email means nothing can ever be sent — mark terminal so this row
        // leaves the LIMIT window instead of being refetched forever and
        // starving newer bookings.
        await db.execute(drizzleSql`
          update bookings set review_prompt_sent = true where id = ${row.bookingId}
        `);
        skippedCount++;
        continue;
      }

      const result = await sendReviewPromptEmail(row.customerEmail, {
        customerName: row.customerName || "Customer",
        vendorName: row.vendorName || "Vendor",
        eventDate: row.eventDate,
        listingTitle: row.listingTitle || "your booking",
        bookingId: row.bookingId,
        serverUrl,
      });

      if (!result.sent) {
        skippedCount++;
        logger.warn(
          "[review prompt] skipped booking %s: %s",
          row.bookingId,
          result.reason || "email not sent"
        );
        continue;
      }

      sentCount++;
      await db.execute(drizzleSql`
        update bookings set review_prompt_sent = true where id = ${row.bookingId}
      `);
      markedCount++;
    } catch (error: any) {
      failedCount++;
      logger.warn(
        "[review prompt] failed for booking %s: %s",
        row.bookingId,
        error?.message || error
      );
    }
  }

  if (sentCount > 0) {
    logger.log("[review prompt] sent %d review prompt(s)", sentCount);
  }

  return {
    cutoffDate,
    eligibleCount: eligible.length,
    sentCount,
    markedCount,
    skippedCount,
    failedCount,
  };
}
