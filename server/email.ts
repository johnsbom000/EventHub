import { bookingConfirmedTemplate, type BookingConfirmedParams } from "./emails/bookingConfirmed";
import { bookingCancelledTemplate, type BookingCancelledParams } from "./emails/bookingCancelled";
import { newMessageTemplate, type NewMessageParams } from "./emails/newMessage";
import { reviewPromptTemplate, type ReviewPromptParams } from "./emails/reviewPrompt";

type BookingConfirmationEmailParams = {
  to: string;
  recipientName: string;
  counterpartName: string;
  eventDate: string;
  totalAmountCents: number;
  role: "customer" | "vendor";
};

type EmailResult = {
  sent: boolean;
  skipped: boolean;
  reason?: string;
};

type CircumventionWarningEmailParams = {
  vendorName: string;
  warningNumber: number;
  reason: string;
  serverUrl: string;
};

type SuspensionEmailParams = {
  vendorName: string;
  endsAt: Date;
  reason: string;
  serverUrl: string;
};

function centsToUsd(amountCents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format((amountCents || 0) / 100);
}

function resendConfig(): { apiKey: string; from: string } | null {
  const apiKey = (process.env.RESEND_API_KEY || "").trim();
  const from = (process.env.RESEND_FROM_EMAIL || "").trim();
  if (!apiKey || !from) return null;
  return { apiKey, from };
}

async function sendViaResend(params: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<EmailResult> {
  const cfg = resendConfig();
  if (!cfg) {
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

// ── Existing function (unchanged) ──────────────────────────────────────────

export async function sendBookingConfirmationEmail(
  params: BookingConfirmationEmailParams
): Promise<EmailResult> {
  const roleLine =
    params.role === "customer"
      ? `Your booking request with ${params.counterpartName} has been created.`
      : `You have a new booking request from ${params.counterpartName}.`;

  const subject =
    params.role === "customer"
      ? "Event Hub: Booking request received"
      : "Event Hub: New booking request";

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5;">
      <h2>Booking Confirmation</h2>
      <p>Hi ${params.recipientName},</p>
      <p>${roleLine}</p>
      <p><strong>Event date:</strong> ${params.eventDate}</p>
      <p><strong>Total:</strong> ${centsToUsd(params.totalAmountCents)}</p>
      <p>You can view this in your Event Hub dashboard.</p>
    </div>
  `;

  return sendViaResend({ to: params.to, subject, html });
}

// ── New send functions ─────────────────────────────────────────────────────

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

export async function sendNewMessageEmail(
  to: string,
  params: NewMessageParams
): Promise<EmailResult> {
  const { subject, html, text } = newMessageTemplate(params);
  return sendViaResend({ to, subject, html, text });
}

export async function sendReviewPromptEmail(
  to: string,
  params: ReviewPromptParams
): Promise<EmailResult> {
  const { subject, html, text } = reviewPromptTemplate(params);
  return sendViaResend({ to, subject, html, text });
}

// ── Circumvention / Policy Emails ──────────────────────────────────────────

export async function sendCircumventionWarningEmail(
  to: string,
  params: CircumventionWarningEmailParams
): Promise<EmailResult> {
  const subject = `Event Hub: Policy warning (${params.warningNumber} of 3)`;
  const dashboardUrl = `${(params.serverUrl || "").replace(/\/$/, "")}/vendor/dashboard`;

  const warningsLeft = 3 - params.warningNumber;
  const warningsLeftText =
    warningsLeft > 0
      ? `You have <strong>${warningsLeft} warning${warningsLeft === 1 ? "" : "s"}</strong> remaining before your account is suspended.`
      : "This is your final warning. A further violation will result in a 30-day suspension.";

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; max-width: 600px;">
      <h2 style="color: #b45309;">Policy Warning — Warning ${params.warningNumber} of 3</h2>
      <p>Hi ${params.vendorName},</p>
      <p>
        Your account has received a policy warning because content you submitted
        appeared to share contact information or redirect customers away from
        Event Hub. Sharing contact details outside of your official business
        profile is not permitted under our platform policy.
      </p>
      <p><strong>Reason:</strong> ${params.reason}</p>
      <p>${warningsLeftText}</p>
      <p>
        If you believe this warning was issued in error, please contact our
        support team. You can also review our policies in your vendor dashboard.
      </p>
      <p><a href="${dashboardUrl}">Open your dashboard</a></p>
    </div>
  `;

  return sendViaResend({ to, subject, html });
}

export async function sendSuspensionEmail(
  to: string,
  params: SuspensionEmailParams
): Promise<EmailResult> {
  const subject = "Event Hub: Account suspended";
  const endsAtFormatted = params.endsAt.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; max-width: 600px;">
      <h2 style="color: #dc2626;">Account Suspended</h2>
      <p>Hi ${params.vendorName},</p>
      <p>
        Your Event Hub vendor account has been suspended for 30 days due to
        repeated policy violations related to sharing contact information or
        redirecting customers off-platform.
      </p>
      <p><strong>Reason:</strong> ${params.reason}</p>
      <p><strong>Suspension ends:</strong> ${endsAtFormatted}</p>
      <p>
        During your suspension, your listings have been made inactive and you
        cannot publish new listings. Existing bookings are not affected.
      </p>
      <p>
        If you believe this suspension was applied in error, please contact our
        support team to appeal.
      </p>
    </div>
  `;

  return sendViaResend({ to, subject, html });
}
