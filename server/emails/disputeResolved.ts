const CORAL = "#E07A6A";
const SLATE = "#4A6A7D";
const BG = "#FAF9F7";
const TEXT = "#1C1C1C";
const GREEN = "#16a34a";
const RED = "#DC2626";

function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((cents || 0) / 100);
}

function baseWrapper(body: string): string {
  return `
<div style="background:${BG};padding:40px 0;font-family:'DM Sans',Arial,sans-serif;color:${TEXT};">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
    <div style="background:${CORAL};padding:28px 32px;">
      <span style="font-family:'Playfair Display',Georgia,serif;font-size:24px;color:#fff;font-weight:700;letter-spacing:0.5px;">EventHub</span>
    </div>
    <div style="padding:32px;">
      ${body}
    </div>
    <div style="padding:20px 32px;border-top:1px solid #f0eeec;text-align:center;">
      <p style="margin:0;font-size:12px;color:#999;">© EventHub. You received this because you have a booking on EventHub.</p>
    </div>
  </div>
</div>`.trim();
}

export interface DisputeResolvedParams {
  /** Role of the RECIPIENT. */
  role: "customer" | "vendor";
  /**
   * Admin's decision.
   * - "refund" — ruled in the customer's favour (customer gets refund, vendor payout cancelled)
   * - "payout" — ruled in the vendor's favour (customer dispute denied, vendor gets paid)
   */
  decision: "refund" | "payout";
  recipientName: string;
  counterpartName: string;
  listingTitle: string;
  eventDate: string;
  /** Only relevant when decision === "refund" and role === "customer". */
  refundAmountCents?: number;
  serverUrl: string;
}

export function disputeResolvedTemplate(params: DisputeResolvedParams): {
  subject: string;
  html: string;
  text: string;
} {
  const {
    role,
    decision,
    recipientName,
    counterpartName,
    listingTitle,
    eventDate,
    refundAmountCents,
    serverUrl,
  } = params;

  const dashboardUrl = role === "vendor"
    ? `${serverUrl}/vendor/bookings`
    : `${serverUrl}/dashboard/events`;

  // ── Subject ───────────────────────────────────────────────────────────────
  const subject =
    role === "customer" && decision === "refund"
      ? "Your EventHub dispute has been resolved — refund approved"
      : role === "customer" && decision === "payout"
      ? "Your EventHub dispute has been resolved"
      : role === "vendor" && decision === "refund"
      ? "EventHub dispute resolved — refund issued to customer"
      : "EventHub dispute resolved — payout released";

  // ── Banner ────────────────────────────────────────────────────────────────
  const bannerColor =
    (role === "customer" && decision === "refund") || (role === "vendor" && decision === "payout")
      ? GREEN
      : RED;

  const bannerBg =
    (role === "customer" && decision === "refund") || (role === "vendor" && decision === "payout")
      ? "#F0FDF4"
      : "#FEF2F2";

  const bannerBorder =
    (role === "customer" && decision === "refund") || (role === "vendor" && decision === "payout")
      ? "#BBF7D0"
      : "#FECACA";

  const bannerText =
    role === "customer" && decision === "refund"
      ? "Dispute Resolved — Refund Approved"
      : role === "customer" && decision === "payout"
      ? "Dispute Resolved — Decision Denied"
      : role === "vendor" && decision === "refund"
      ? "Dispute Resolved — Refund Issued to Customer"
      : "Dispute Resolved — Payout Released";

  // ── Intro paragraph ───────────────────────────────────────────────────────
  const intro =
    role === "customer" && decision === "refund"
      ? `After reviewing your dispute with <strong>${counterpartName}</strong>, our team has decided in your favour. A refund has been issued.`
      : role === "customer" && decision === "payout"
      ? `After reviewing your dispute with <strong>${counterpartName}</strong>, our team was unable to rule in your favour at this time. The vendor's payout has been released.`
      : role === "vendor" && decision === "refund"
      ? `After reviewing the dispute filed by <strong>${counterpartName}</strong>, our team has decided to issue a refund to the customer. Your payout for this booking has been cancelled.`
      : `After reviewing the dispute filed by <strong>${counterpartName}</strong>, our team has decided in your favour. Your payout for this booking has been released.`;

  // ── Extra detail rows ─────────────────────────────────────────────────────
  const extraRows =
    role === "customer" && decision === "refund" && typeof refundAmountCents === "number"
      ? `<tr><td style="padding:8px 0;font-size:14px;color:#666;">Refund Amount</td><td style="padding:8px 0;font-size:14px;font-weight:700;text-align:right;color:${GREEN};">${formatCents(refundAmountCents)}</td></tr>`
      : "";

  // ── Follow-up note ────────────────────────────────────────────────────────
  const followUpNote =
    role === "customer" && decision === "refund"
      ? `<p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#555;">Your refund will appear on your original payment method within 5–10 business days. If you don't see it after that, please contact your bank.</p>`
      : role === "customer" && decision === "payout"
      ? `<p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#555;">If you have additional evidence or believe this decision was made in error, please reply to this email within 7 days to request a secondary review.</p>`
      : role === "vendor" && decision === "refund"
      ? `<p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#555;">If you believe this decision was made in error, please reply to this email within 7 days to request a secondary review.</p>`
      : `<p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#555;">Your payout will be processed according to the normal payout schedule. Thank you for your patience during the review.</p>`;

  const body = `
    <div style="background:${bannerBg};border:1px solid ${bannerBorder};border-radius:6px;padding:14px 18px;margin-bottom:24px;">
      <p style="margin:0;font-size:13px;color:${bannerColor};font-weight:600;">${bannerText}</p>
    </div>
    <h2 style="margin:0 0 16px;font-family:'Playfair Display',Georgia,serif;font-size:22px;color:${SLATE};">Dispute Resolved</h2>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Hi ${recipientName},</p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;">${intro}</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
      <tr><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;color:#666;">Service</td><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;font-weight:600;text-align:right;">${listingTitle}</td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;color:#666;">Event Date</td><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;font-weight:600;text-align:right;">${eventDate}</td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;color:#666;">Decision</td><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;font-weight:600;text-align:right;">${decision === "refund" ? "Refund to customer" : "Payout to vendor"}</td></tr>
      ${extraRows}
    </table>
    ${followUpNote}
    <a href="${dashboardUrl}" style="display:inline-block;background:${CORAL};color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:14px;font-weight:600;">View Dashboard</a>
  `;

  // ── Plain text ─────────────────────────────────────────────────────────────
  const refundLine =
    role === "customer" && decision === "refund" && typeof refundAmountCents === "number"
      ? `Refund Amount: ${formatCents(refundAmountCents)}`
      : "";

  const text = [
    `Dispute Resolved`,
    ``,
    `Hi ${recipientName},`,
    ``,
    role === "customer" && decision === "refund"
      ? `After reviewing your dispute with ${counterpartName}, our team has decided in your favour. A refund has been issued.`
      : role === "customer" && decision === "payout"
      ? `After reviewing your dispute with ${counterpartName}, our team was unable to rule in your favour. The vendor's payout has been released.`
      : role === "vendor" && decision === "refund"
      ? `A refund has been issued to ${counterpartName} for this booking. Your payout has been cancelled.`
      : `Our team has decided in your favour. Your payout for this booking has been released.`,
    ``,
    `Service: ${listingTitle}`,
    `Event Date: ${eventDate}`,
    `Decision: ${decision === "refund" ? "Refund to customer" : "Payout to vendor"}`,
    refundLine,
    ``,
    `View your dashboard: ${dashboardUrl}`,
  ].filter(Boolean).join("\n");

  return { subject, html: baseWrapper(body), text };
}
