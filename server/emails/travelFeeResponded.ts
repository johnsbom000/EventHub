const CORAL = "#E07A6A";
const SLATE = "#4A6A7D";
const BG = "#FAF9F7";
const TEXT = "#1C1C1C";

function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format((cents || 0) / 100);
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

export interface TravelFeeRespondedParams {
  /** Vendor's business name (email recipient). */
  recipientName: string;
  /** Customer's display name. */
  customerName: string;
  listingTitle: string;
  eventDate: string;
  /** The vendor's travel/delivery fee itself (excludes the customer service fee). */
  amountCents: number;
  /**
   * Customer service fee the customer paid on top, and the total charged to
   * their card. Present on the "accepted" path so this email never tells the
   * vendor the customer paid less than they actually did. The vendor's own
   * earnings are still `amountCents` minus commission — the service fee is
   * never part of the vendor's side.
   */
  customerFeeCents?: number | null;
  chargedAmountCents?: number | null;
  /** Whether the customer paid or declined the fee. */
  action: "accepted" | "declined";
  feeLabel: "travel fee" | "delivery fee";
  serverUrl: string;
}

export function travelFeeRespondedTemplate(params: TravelFeeRespondedParams): {
  subject: string;
  html: string;
  text: string;
} {
  const {
    recipientName,
    customerName,
    listingTitle,
    eventDate,
    amountCents,
    customerFeeCents,
    chargedAmountCents,
    action,
    feeLabel,
    serverUrl,
  } = params;

  const feeLabelCap = feeLabel.charAt(0).toUpperCase() + feeLabel.slice(1);
  const amountFmt = formatCents(amountCents);
  const dashboardUrl = `${serverUrl}/vendor/bookings`;

  const isPaid = action === "accepted";
  const serviceFeeCents = Math.max(0, Math.round(customerFeeCents ?? 0));
  const totalCents = Math.max(0, Math.round(chargedAmountCents ?? amountCents + serviceFeeCents));
  const hasServiceFee = isPaid && serviceFeeCents > 0;
  const serviceFeeFmt = formatCents(serviceFeeCents);
  const totalFmt = formatCents(totalCents);
  const paidQuoteFmt = hasServiceFee ? `${amountFmt} (${totalFmt} with the ${serviceFeeFmt} service fee)` : amountFmt;

  const subject = isPaid
    ? `EventHub: ${feeLabelCap} paid — booking confirmed`
    : `EventHub: ${feeLabelCap} declined`;

  const heading = isPaid ? `${feeLabelCap} Paid` : `${feeLabelCap} Declined`;

  const intro = isPaid
    ? `<strong>${customerName}</strong> paid the ${feeLabel} of <strong>${paidQuoteFmt}</strong> for the booking on ${eventDate}. The booking is now confirmed.`
    : `<strong>${customerName}</strong> declined the ${feeLabel} of <strong>${amountFmt}</strong> for the booking on ${eventDate}. You can propose a revised amount or cancel the booking.`;

  const banner = isPaid
    ? `<div style="background:#f0fdf4;border-left:3px solid #16a34a;padding:12px 16px;border-radius:4px;margin-bottom:24px;">
        <p style="margin:0;font-size:13px;color:#15803d;font-weight:600;">Payment received — no further action needed.</p>
      </div>`
    : `<div style="background:#fff8f0;border-left:3px solid ${CORAL};padding:12px 16px;border-radius:4px;margin-bottom:24px;">
        <p style="margin:0;font-size:13px;color:#b45309;font-weight:600;">Action required — propose a revised amount or cancel the booking from your dashboard.</p>
      </div>`;

  const body = `
    <h2 style="margin:0 0 16px;font-family:'Playfair Display',Georgia,serif;font-size:22px;color:${SLATE};">${heading}</h2>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Hi ${recipientName},</p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;">${intro}</p>
    ${banner}
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
      <tr><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;color:#666;">Service</td><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;font-weight:600;text-align:right;">${listingTitle}</td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;color:#666;">Event Date</td><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;font-weight:600;text-align:right;">${eventDate}</td></tr>
      <tr><td style="padding:8px 0;${hasServiceFee ? "border-bottom:1px solid #f0eeec;" : ""}font-size:14px;color:#666;">${feeLabelCap}</td><td style="padding:8px 0;${hasServiceFee ? "border-bottom:1px solid #f0eeec;" : ""}font-size:14px;font-weight:700;text-align:right;color:${isPaid ? "#16a34a" : CORAL};">${amountFmt}</td></tr>
      ${hasServiceFee ? `
      <tr><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;color:#666;">Customer service fee</td><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;font-weight:600;text-align:right;">${serviceFeeFmt}</td></tr>
      <tr><td style="padding:8px 0;font-size:14px;color:#666;">Customer charged</td><td style="padding:8px 0;font-size:14px;font-weight:600;text-align:right;">${totalFmt}</td></tr>` : ""}
    </table>
    <a href="${dashboardUrl}" style="display:inline-block;background:${CORAL};color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:14px;font-weight:600;">View Booking</a>
  `;

  const textIntro = isPaid
    ? `${customerName} paid the ${feeLabel} of ${paidQuoteFmt} for the booking on ${eventDate}. The booking is now confirmed.`
    : `${customerName} declined the ${feeLabel} of ${amountFmt} for the booking on ${eventDate}. You can propose a revised amount or cancel the booking.`;

  const text = [
    heading,
    ``,
    `Hi ${recipientName},`,
    ``,
    textIntro,
    ``,
    `Service: ${listingTitle}`,
    `Event Date: ${eventDate}`,
    `${feeLabelCap}: ${amountFmt}`,
    ...(hasServiceFee ? [`Customer service fee: ${serviceFeeFmt}`, `Customer charged: ${totalFmt}`] : []),
    ``,
    `View booking: ${dashboardUrl}`,
  ].join("\n");

  return { subject, html: baseWrapper(body), text };
}
