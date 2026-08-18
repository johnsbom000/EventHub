import { and, eq, gt, isNull, lte, ne } from "drizzle-orm";
import { db } from "../db";
import { vendorAccounts } from "@shared/schema";
import { sendCompExpiryReminderEmail } from "../email";

const DAY_MS = 24 * 60 * 60 * 1000;

type JobLogger = { log: (msg: string) => void; warn: (msg: string) => void };

export type CompExpiryReminderJobResult = {
  sevenDaySent: number;
  oneDaySent: number;
};

/**
 * Daily job: emails vendors on a comp ("free Pro") grant before it expires, so
 * they know when it ends and what happens if they don't add a card.
 *
 * Two non-overlapping windows keyed off comp_ends_at, each sent at most once per
 * grant (tracked by comp_reminder_*_sent_at, reset when a new comp is granted):
 *   - 1-day  reminder: expiry within (now, now + 1 day]
 *   - 7-day  reminder: expiry within (now + 1 day, now + 7 days]
 *
 * daysLeft in the email is computed from the actual expiry, so the copy is
 * correct even if a tick is missed and a reminder goes out a little late.
 */
export async function runCompExpiryReminderJob(opts: {
  serverUrl: string;
  logger?: JobLogger;
}): Promise<CompExpiryReminderJobResult> {
  const { serverUrl, logger } = opts;
  const now = new Date();
  const in1d = new Date(now.getTime() + 1 * DAY_MS);
  const in7d = new Date(now.getTime() + 7 * DAY_MS);

  const daysLeftFrom = (compEndsAt: Date): number =>
    Math.max(1, Math.ceil((compEndsAt.getTime() - now.getTime()) / DAY_MS));

  // 1-day window first (tighter), so a vendor within a day never also matches 7d.
  const oneDayRows = await db
    .select({
      id: vendorAccounts.id,
      email: vendorAccounts.email,
      businessName: vendorAccounts.businessName,
      compEndsAt: vendorAccounts.compEndsAt,
    })
    .from(vendorAccounts)
    .where(
      and(
        eq(vendorAccounts.subscriptionStatus, "comp"),
        // Commission vendors have no plan to fall back to — the reminder tells
        // them they "move to the Free plan" and keep "1 listing", both false for
        // a model with no tiers. A stray comp row must not trigger it.
        ne(vendorAccounts.pricingModel, "commission"),
        isNull(vendorAccounts.compReminder1dSentAt),
        gt(vendorAccounts.compEndsAt, now),
        lte(vendorAccounts.compEndsAt, in1d)
      )
    );

  let oneDaySent = 0;
  for (const v of oneDayRows) {
    if (!v.compEndsAt) continue;
    const ok = await sendReminder(v, daysLeftFrom(v.compEndsAt), serverUrl, logger);
    if (ok) {
      await db
        .update(vendorAccounts)
        .set({ compReminder1dSentAt: now })
        .where(eq(vendorAccounts.id, v.id));
      oneDaySent++;
    }
  }

  // 7-day window: (now + 1 day, now + 7 days].
  const sevenDayRows = await db
    .select({
      id: vendorAccounts.id,
      email: vendorAccounts.email,
      businessName: vendorAccounts.businessName,
      compEndsAt: vendorAccounts.compEndsAt,
    })
    .from(vendorAccounts)
    .where(
      and(
        eq(vendorAccounts.subscriptionStatus, "comp"),
        // See the 1-day window above.
        ne(vendorAccounts.pricingModel, "commission"),
        isNull(vendorAccounts.compReminder7dSentAt),
        gt(vendorAccounts.compEndsAt, in1d),
        lte(vendorAccounts.compEndsAt, in7d)
      )
    );

  let sevenDaySent = 0;
  for (const v of sevenDayRows) {
    if (!v.compEndsAt) continue;
    const ok = await sendReminder(v, daysLeftFrom(v.compEndsAt), serverUrl, logger);
    if (ok) {
      await db
        .update(vendorAccounts)
        .set({ compReminder7dSentAt: now })
        .where(eq(vendorAccounts.id, v.id));
      sevenDaySent++;
    }
  }

  if (oneDaySent || sevenDaySent) {
    logger?.log(`[comp-expiry-reminder] sent ${sevenDaySent} 7-day + ${oneDaySent} 1-day reminders`);
  }
  return { sevenDaySent, oneDaySent };
}

// Returns true if the send should be treated as done (sent or config-skipped), so
// the row is stamped and not retried forever. A thrown error returns false so the
// reminder is retried on the next daily tick.
async function sendReminder(
  vendor: { email: string | null; businessName: string | null },
  daysLeft: number,
  serverUrl: string,
  logger?: JobLogger
): Promise<boolean> {
  if (!vendor.email) return true; // nothing to send to; don't retry a null address
  try {
    await sendCompExpiryReminderEmail(vendor.email, {
      recipientName: vendor.businessName || "there",
      businessName: vendor.businessName || "your business",
      daysLeft,
      serverUrl,
    });
    return true;
  } catch (err: any) {
    logger?.warn(`[comp-expiry-reminder] send failed for ${vendor.email}: ${err?.message || err}`);
    return false;
  }
}
