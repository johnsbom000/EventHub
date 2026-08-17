import { and, eq, isNull, lte, ne } from "drizzle-orm";
import { db } from "../db";
import { vendorAccounts } from "@shared/schema";
import { sendProTrialEndingEmail } from "../email";
import { createNotification } from "../lib/notificationHelpers";
import { logEvent } from "../lib/events";
import { REVERSE_TRIAL_CARD_PROMPT_DAY, PRO_TRIAL_PERIOD_DAYS } from "../lib/constants";

const DAY_MS = 24 * 60 * 60 * 1000;

type JobLogger = { log: (msg: string) => void; warn: (msg: string) => void };

export type ReverseTrialCardPromptJobResult = { promptsSent: number };

/**
 * Daily job for the Reverse-Trial Experiment: at day 21 of a vendor's card-free
 * 30-day Pro trial, prompt them in-app + by email to add a card (so it converts to
 * paid Pro at day 30 instead of downgrading to Starter). This is the driver of the
 * "card-capture rate at day 21" metric; the card itself is captured via the in-app
 * SetupIntent flow (setup_intent.succeeded webhook stamps reverse_trial_card_captured_at).
 *
 * Sent at most ONCE per trial (tracked by reverse_trial_card_prompt_sent_at). We
 * only target still-trialing reverse-trial vendors who have not already added a
 * card. Stripe also fires its native trial_will_end nudge ~day 27 as a backstop.
 */
export async function runReverseTrialCardPromptJob(opts: {
  serverUrl: string;
  logger?: JobLogger;
}): Promise<ReverseTrialCardPromptJobResult> {
  const { serverUrl, logger } = opts;
  const now = new Date();
  const promptCutoff = new Date(now.getTime() - REVERSE_TRIAL_CARD_PROMPT_DAY * DAY_MS);

  const rows = await db
    .select({
      id: vendorAccounts.id,
      email: vendorAccounts.email,
      businessName: vendorAccounts.businessName,
      reverseTrialStartedAt: vendorAccounts.reverseTrialStartedAt,
      subscriptionCurrentPeriodEnd: vendorAccounts.subscriptionCurrentPeriodEnd,
    })
    .from(vendorAccounts)
    .where(
      and(
        // Enrolled in the reverse trial ≥ 21 days ago…
        lte(vendorAccounts.reverseTrialStartedAt, promptCutoff),
        // …still on the trial, no card added yet, and not already prompted.
        eq(vendorAccounts.subscriptionStatus, "trialing"),
        isNull(vendorAccounts.reverseTrialCardCapturedAt),
        isNull(vendorAccounts.reverseTrialCardPromptSentAt),
        // Commission vendors have no trial/subscription and are never enrolled by
        // startReverseTrialForVendor, but excluding them here too keeps this cohort
        // query correct on its own terms (pricing_model is NOT NULL, so `ne` never
        // silently drops legitimate subscription-model rows).
        ne(vendorAccounts.pricingModel, "commission")
      )
    );

  let promptsSent = 0;
  for (const v of rows) {
    // Trial end = Stripe's period end if known, else start + 30 days.
    const trialEnd =
      v.subscriptionCurrentPeriodEnd
        ? new Date(v.subscriptionCurrentPeriodEnd)
        : v.reverseTrialStartedAt
          ? new Date(new Date(v.reverseTrialStartedAt).getTime() + PRO_TRIAL_PERIOD_DAYS * DAY_MS)
          : null;
    const daysLeft = trialEnd
      ? Math.max(1, Math.ceil((trialEnd.getTime() - now.getTime()) / DAY_MS))
      : PRO_TRIAL_PERIOD_DAYS - REVERSE_TRIAL_CARD_PROMPT_DAY;

    const ok = await sendPrompt(v, daysLeft, serverUrl, logger);
    if (ok) {
      await db
        .update(vendorAccounts)
        .set({ reverseTrialCardPromptSentAt: now })
        .where(eq(vendorAccounts.id, v.id));
      logEvent("reverse_trial_card_prompt_sent", "vendor", v.id, { daysLeft });
      promptsSent++;
    }
  }

  if (promptsSent) {
    logger?.log(`[reverse-trial-card-prompt] sent ${promptsSent} day-${REVERSE_TRIAL_CARD_PROMPT_DAY} prompts`);
  }
  return { promptsSent };
}

// Sends the in-app notification + email. Returns true when the row should be
// stamped (sent, or nothing to email). A thrown error returns false so the prompt
// is retried on the next daily tick (the notification is best-effort, non-fatal).
async function sendPrompt(
  vendor: { id: string; email: string | null; businessName: string | null },
  daysLeft: number,
  serverUrl: string,
  logger?: JobLogger
): Promise<boolean> {
  try {
    await createNotification({
      recipientId: vendor.id,
      recipientType: "vendor",
      type: "pro_trial_ending",
      title: "Add a card to keep Pro",
      message: `Your free Pro trial ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}. Add a card to keep unlimited listings, analytics, and calendar sync — or you'll move to the free plan.`,
      link: "/vendor/dashboard",
    });
  } catch (err: any) {
    // Notification failure alone shouldn't block the email or retry forever.
    logger?.warn(`[reverse-trial-card-prompt] notification failed for ${vendor.id}: ${err?.message || err}`);
  }

  if (!vendor.email) return true; // nothing to email; don't retry a null address
  try {
    await sendProTrialEndingEmail(vendor.email, {
      recipientName: vendor.businessName || "there",
      businessName: vendor.businessName || "your business",
      daysLeft,
      serverUrl,
    });
    return true;
  } catch (err: any) {
    logger?.warn(`[reverse-trial-card-prompt] email failed for ${vendor.email}: ${err?.message || err}`);
    return false;
  }
}
