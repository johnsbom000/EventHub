const CORAL = "#E07A6A";
const SLATE = "#4A6A7D";
const BG = "#FAF9F7";
const TEXT = "#1C1C1C";
const AMBER = "#B45309";

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

const REASON_LABELS: Record<string, string> = {
  item_not_as_described: "Service not as described",
  late_or_no_show:       "Late arrival or no-show",
  damaged_or_missing:    "Damaged or missing items",
  other:                 "Other",
};

export interface DisputeFiledParams {
  /** Role of the RECIPIENT — determines messaging and dashboard link. */
  role: "customer" | "vendor";
  recipientName: string;
  /** The other party's name (customer name when notifying vendor, vendor/business name when notifying customer). */
  counterpartName: string;
  listingTitle: string;
  eventDate: string;
  reason: "item_not_as_described" | "late_or_no_show" | "damaged_or_missing" | "other";
  /** Short customer-written details about the dispute. */
  details: string;
  /** ISO timestamp of when the dispute was filed (for display). */
  filedAt: string;
  serverUrl: string;
}

export function disputeFiledTemplate(params: DisputeFiledParams): {
  subject: string;
  html: string;
  text: string;
} {
  const {
    role,
    recipientName,
    counterpartName,
    listingTitle,
    eventDate,
    reason,
    details,
    filedAt,
    serverUrl,
  } = params;

  const reasonLabel = REASON_LABELS[reason] ?? "Other";
  const dashboardUrl = role === "vendor"
    ? `${serverUrl}/vendor/bookings`
    : `${serverUrl}/dashboard/events`;

  const subject = role === "customer"
    ? "Your EventHub dispute has been filed"
    : "EventHub: A dispute has been filed on one of your bookings";

  const intro = role === "customer"
    ? `Your dispute regarding <strong>${counterpartName}</strong> has been received. Our team will review it and follow up within 2 business days.`
    : `A customer has filed a dispute on their booking with <strong>${counterpartName}</strong>. Our team will review it and may reach out for additional information.`;

  const nextSteps = role === "customer"
    ? `<p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#555;">While your dispute is under review, the vendor's payout has been paused. You'll hear from us within 2 business days. Please don't open duplicate disputes — we have everything we need.</p>`
    : `<p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#555;">Your payout for this booking is temporarily on hold while the dispute is under review. If you have supporting documentation (photos, messages, contracts), please reply to this email or visit your dashboard to add context.</p>`;

  const body = `
    <div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:6px;padding:14px 18px;margin-bottom:24px;">
      <p style="margin:0;font-size:13px;color:${AMBER};font-weight:600;">Dispute Under Review</p>
    </div>
    <h2 style="margin:0 0 16px;font-family:'Playfair Display',Georgia,serif;font-size:22px;color:${SLATE};">Dispute Filed</h2>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Hi ${recipientName},</p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;">${intro}</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
      <tr><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;color:#666;">Service</td><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;font-weight:600;text-align:right;">${listingTitle}</td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;color:#666;">Event Date</td><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;font-weight:600;text-align:right;">${eventDate}</td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;color:#666;">Reason</td><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;font-weight:600;text-align:right;">${reasonLabel}</td></tr>
      <tr><td style="padding:8px 0;font-size:14px;color:#666;">Filed</td><td style="padding:8px 0;font-size:14px;font-weight:600;text-align:right;">${filedAt}</td></tr>
    </table>
    <div style="background:#F8F7F5;border-radius:6px;padding:14px 18px;margin-bottom:24px;">
      <p style="margin:0 0 6px;font-size:12px;color:#999;text-transform:uppercase;letter-spacing:0.5px;">Customer's Description</p>
      <p style="margin:0;font-size:14px;line-height:1.6;color:#333;">${details}</p>
    </div>
    ${nextSteps}
    <a href="${dashboardUrl}" style="display:inline-block;background:${CORAL};color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:14px;font-weight:600;">View Dashboard</a>
  `;

  const text = [
    `Dispute Filed`,
    ``,
    `Hi ${recipientName},`,
    ``,
    role === "customer"
      ? `Your dispute regarding ${counterpartName} has been received. Our team will review it within 2 business days.`
      : `A customer has filed a dispute on their booking with ${counterpartName}. Your payout is temporarily on hold.`,
    ``,
    `Service: ${listingTitle}`,
    `Event Date: ${eventDate}`,
    `Reason: ${reasonLabel}`,
    `Filed: ${filedAt}`,
    ``,
    `Customer's Description:`,
    details,
    ``,
    `View your dashboard: ${dashboardUrl}`,
  ].join("\n");

  return { subject, html: baseWrapper(body), text };
}
