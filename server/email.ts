import { logger } from "./lib/logger";
import { bookingRequestedTemplate, type BookingRequestedParams } from "./emails/bookingRequested";
import { bookingConfirmedTemplate, type BookingConfirmedParams } from "./emails/bookingConfirmed";
import { bookingCancelledTemplate, type BookingCancelledParams } from "./emails/bookingCancelled";
import { newMessageTemplate, type NewMessageParams } from "./emails/newMessage";
import { reviewPromptTemplate, type ReviewPromptParams } from "./emails/reviewPrompt";
import { circumventionWarningTemplate, type CircumventionWarningParams } from "./emails/circumventionWarning";
import { accountSuspendedTemplate, type AccountSuspendedParams } from "./emails/accountSuspended";
import { newReviewReceivedTemplate, type NewReviewReceivedParams } from "./emails/newReviewReceived";
import { paymentReceiptTemplate, type PaymentReceiptParams } from "./emails/paymentReceipt";
import { listingTakenDownTemplate, type ListingTakenDownParams } from "./emails/listingTakenDown";
import { vendorWelcomeTemplate, type VendorWelcomeParams } from "./emails/vendorWelcome";
import { proTrialEndingTemplate, type ProTrialEndingParams } from "./emails/proTrialEnding";
import { compExpiryReminderTemplate, type CompExpiryReminderParams } from "./emails/compExpiryReminder";
import { compPublishNudgeTemplate, type CompPublishNudgeParams } from "./emails/compPublishNudge";
import { compRevokedTemplate, type CompRevokedParams } from "./emails/compRevoked";
import { eventDayReminderTemplate, type EventDayReminderParams } from "./emails/eventDayReminder";
import { payoutProcessedTemplate, type PayoutProcessedParams } from "./emails/payoutProcessed";
import { suspensionLiftedTemplate, type SuspensionLiftedParams } from "./emails/suspensionLifted";
import { pendingRequestReminderTemplate, type PendingRequestReminderParams } from "./emails/pendingRequestReminder";
import { disputeFiledTemplate, type DisputeFiledParams } from "./emails/disputeFiled";
import { disputeVendorRespondedTemplate, type DisputeVendorRespondedParams } from "./emails/disputeVendorResponded";
import { disputeResolvedTemplate, type DisputeResolvedParams } from "./emails/disputeResolved";
import { disputeResponseTemplate, type DisputeResponseParams } from "./emails/disputeResponse";
import { travelFeeProposedTemplate, type TravelFeeProposedParams } from "./emails/travelFeeProposed";
import { travelFeeRespondedTemplate, type TravelFeeRespondedParams } from "./emails/travelFeeResponded";
import { feedbackReceivedTemplate, type FeedbackReceivedParams } from "./emails/feedbackReceived";
import { appUrl } from "./lib/routeHelpers";

export type EmailResult = {
  sent: boolean;
  skipped: boolean;
  reason?: string;
};

function resendConfig(): { apiKey: string; from: string } | null {
  const apiKey = (process.env.RESEND_API_KEY || "").trim();
  const from = (process.env.RESEND_FROM_EMAIL || "").trim();
  if (!apiKey || !from) return null;
  return { apiKey, from };
}

export async function sendViaResendRaw(params: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<EmailResult> {
  return sendViaResend(params);
}

async function sendViaResend(params: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<EmailResult> {
  const cfg = resendConfig();
  if (!cfg) {
    logger.warn(
      "[email] Skipping email send — RESEND_API_KEY or RESEND_FROM_EMAIL is not configured. To: %s | Subject: %s",
      params.to,
      params.subject
    );
    return {
      sent: false,
      skipped: true,
      reason: "RESEND_API_KEY or RESEND_FROM_EMAIL is not configured",
    };
  }

  const body: Record<string, unknown> = {
    from: cfg.from,
    to: [params.to],
    subject: params.subject,
    html: params.html,
  };
  if (params.text) body.text = params.text;

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    return {
      sent: false,
      skipped: false,
      reason: text || `Resend returned ${resp.status}`,
    };
  }

  return { sent: true, skipped: false };
}

// ── Booking ────────────────────────────────────────────────────────────────

export async function sendBookingRequestedEmail(
  to: string,
  params: BookingRequestedParams
): Promise<EmailResult> {
  const { subject, html, text } = bookingRequestedTemplate(params);
  return sendViaResend({ to, subject, html, text });
}

export async function sendBookingConfirmedEmail(
  to: string,
  params: BookingConfirmedParams
): Promise<EmailResult> {
  const { subject, html, text } = bookingConfirmedTemplate(params);
  return sendViaResend({ to, subject, html, text });
}

export async function sendBookingCancelledEmail(
  to: string,
  params: BookingCancelledParams
): Promise<EmailResult> {
  const { subject, html, text } = bookingCancelledTemplate(params);
  return sendViaResend({ to, subject, html, text });
}

// ── Messages ───────────────────────────────────────────────────────────────

export async function sendNewMessageEmail(
  to: string,
  params: NewMessageParams
): Promise<EmailResult> {
  const { subject, html, text } = newMessageTemplate(params);
  return sendViaResend({ to, subject, html, text });
}

// ── Reviews ────────────────────────────────────────────────────────────────

export async function sendReviewPromptEmail(
  to: string,
  params: ReviewPromptParams
): Promise<EmailResult> {
  const { subject, html, text } = reviewPromptTemplate(params);
  return sendViaResend({ to, subject, html, text });
}

export async function sendNewReviewReceivedEmail(
  to: string,
  params: NewReviewReceivedParams
): Promise<EmailResult> {
  const { subject, html, text } = newReviewReceivedTemplate(params);
  return sendViaResend({ to, subject, html, text });
}

// ── Payments ───────────────────────────────────────────────────────────────

export async function sendPaymentReceiptEmail(
  to: string,
  params: PaymentReceiptParams
): Promise<EmailResult> {
  const { subject, html, text } = paymentReceiptTemplate(params);
  return sendViaResend({ to, subject, html, text });
}

export async function sendPayoutProcessedEmail(
  to: string,
  params: PayoutProcessedParams
): Promise<EmailResult> {
  const { subject, html, text } = payoutProcessedTemplate(params);
  return sendViaResend({ to, subject, html, text });
}

// ── Policy / Circumvention ─────────────────────────────────────────────────

export async function sendCircumventionWarningEmail(
  to: string,
  params: CircumventionWarningParams
): Promise<EmailResult> {
  const { subject, html, text } = circumventionWarningTemplate(params);
  return sendViaResend({ to, subject, html, text });
}

export async function sendAccountSuspendedEmail(
  to: string,
  params: AccountSuspendedParams
): Promise<EmailResult> {
  const { subject, html, text } = accountSuspendedTemplate(params);
  return sendViaResend({ to, subject, html, text });
}

export async function sendSuspensionLiftedEmail(
  to: string,
  params: SuspensionLiftedParams
): Promise<EmailResult> {
  const { subject, html, text } = suspensionLiftedTemplate(params);
  return sendViaResend({ to, subject, html, text });
}

// ── Listings ───────────────────────────────────────────────────────────────

export async function sendListingTakenDownEmail(
  to: string,
  params: ListingTakenDownParams
): Promise<EmailResult> {
  const { subject, html, text } = listingTakenDownTemplate(params);
  return sendViaResend({ to, subject, html, text });
}

// ── Vendor onboarding ──────────────────────────────────────────────────────

export async function sendVendorWelcomeEmail(
  to: string,
  params: VendorWelcomeParams
): Promise<EmailResult> {
  const { subject, html, text } = vendorWelcomeTemplate(params);
  return sendViaResend({ to, subject, html, text });
}

export async function sendProTrialEndingEmail(
  to: string,
  params: ProTrialEndingParams
): Promise<EmailResult> {
  const { subject, html, text } = proTrialEndingTemplate(params);
  return sendViaResend({ to, subject, html, text });
}

export async function sendCompExpiryReminderEmail(
  to: string,
  params: CompExpiryReminderParams
): Promise<EmailResult> {
  const { subject, html, text } = compExpiryReminderTemplate(params);
  return sendViaResend({ to, subject, html, text });
}

export async function sendCompPublishNudgeEmail(
  to: string,
  params: CompPublishNudgeParams
): Promise<EmailResult> {
  const { subject, html, text } = compPublishNudgeTemplate(params);
  return sendViaResend({ to, subject, html, text });
}

export async function sendCompRevokedEmail(
  to: string,
  params: CompRevokedParams
): Promise<EmailResult> {
  const { subject, html, text } = compRevokedTemplate(params);
  return sendViaResend({ to, subject, html, text });
}

// ── Reminders ─────────────────────────────────────────────────────────────

export async function sendEventDayReminderEmail(
  to: string,
  params: EventDayReminderParams
): Promise<EmailResult> {
  const { subject, html, text } = eventDayReminderTemplate(params);
  return sendViaResend({ to, subject, html, text });
}

export async function sendPendingRequestReminderEmail(
  to: string,
  params: PendingRequestReminderParams
): Promise<EmailResult> {
  const { subject, html, text } = pendingRequestReminderTemplate(params);
  return sendViaResend({ to, subject, html, text });
}

export async function sendDisputeFiledEmail(
  to: string,
  params: DisputeFiledParams
): Promise<EmailResult> {
  const { subject, html, text } = disputeFiledTemplate(params);
  return sendViaResend({ to, subject, html, text });
}

export async function sendDisputeVendorRespondedEmail(
  to: string,
  params: DisputeVendorRespondedParams
): Promise<EmailResult> {
  const { subject, html, text } = disputeVendorRespondedTemplate(params);
  return sendViaResend({ to, subject, html, text });
}

export async function sendDisputeResolvedEmail(
  to: string,
  params: DisputeResolvedParams
): Promise<EmailResult> {
  const { subject, html, text } = disputeResolvedTemplate(params);
  return sendViaResend({ to, subject, html, text });
}

export async function sendDisputeResponseEmail(
  to: string,
  params: DisputeResponseParams
): Promise<EmailResult> {
  const { subject, html, text } = disputeResponseTemplate(params);
  return sendViaResend({ to, subject, html, text });
}

export async function sendTravelFeeProposedEmail(
  to: string,
  params: TravelFeeProposedParams
): Promise<EmailResult> {
  const { subject, html, text } = travelFeeProposedTemplate(params);
  return sendViaResend({ to, subject, html, text });
}

export async function sendTravelFeeRespondedEmail(
  to: string,
  params: TravelFeeRespondedParams
): Promise<EmailResult> {
  const { subject, html, text } = travelFeeRespondedTemplate(params);
  return sendViaResend({ to, subject, html, text });
}

// ── Internal: feedback notifications ─────────────────────────────────────────

/**
 * The single inbox that receives an alert every time a user submits a feature
 * request or bug report. Defaults to the founder's personal address so it goes
 * to only one person; override with FEEDBACK_NOTIFY_EMAIL if that changes.
 */
export function feedbackNotifyRecipient(): string {
  return (process.env.FEEDBACK_NOTIFY_EMAIL || "").trim() || "johnsbom000@gmail.com";
}

export async function sendFeedbackReceivedEmail(
  params: Omit<FeedbackReceivedParams, "serverUrl">
): Promise<EmailResult> {
  const { subject, html, text } = feedbackReceivedTemplate({ ...params, serverUrl: appUrl() });
  return sendViaResend({ to: feedbackNotifyRecipient(), subject, html, text });
}

