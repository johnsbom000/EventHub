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

export interface TravelFeeProposedParams {
  /** Customer's display name. */
  recipientName: string;
  /** Vendor's business name. */
  vendorName: string;
  listingTitle: string;
  eventDate: string;
  amountCents: number;
  /** Optional explanation the vendor provided with the proposal. */
  reason?: string | null;
  feeLabel: "travel fee" | "delivery fee";
  serverUrl: string;
}

export function travelFeeProposedTemplate(params: TravelFeeProposedParams): {
  subject: string;
  html: string;
  text: string;
} {
  const { recipientName, vendorName, listingTitle, eventDate, amountCents, reason, feeLabel, serverUrl } = params;

  const feeLabelCap = feeLabel.charAt(0).toUpperCase() + feeLabel.slice(1);
  const amountFmt = formatCents(amountCents);
  const dashboardUrl = `${serverUrl}/dashboard/events`;

  const subject = `EventHub: ${feeLabelCap} proposed for your booking`;

  const body = `
    <h2 style="margin:0 0 16px;font-family:'Playfair Display',Georgia,serif;font-size:22px;color:${SLATE};">${feeLabelCap} Proposed</h2>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Hi ${recipientName},</p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;">
      <strong>${vendorName}</strong> has proposed a ${feeLabel} of <strong>${amountFmt}</strong> for your booking on ${eventDate}.
      Please review and accept or decline from your booking page.
    </p>
    ${reason ? `
    <div style="background:#f9f8f6;border-left:3px solid #d1c9bf;padding:12px 16px;border-radius:4px;margin-bottom:20px;">
      <p style="margin:0;font-size:13px;color:#555;font-style:italic;">"${reason}"</p>
    </div>` : ""}
    <div style="background:#fff8f0;border-left:3px solid ${CORAL};padding:12px 16px;border-radius:4px;margin-bottom:24px;">
      <p style="margin:0;font-size:13px;color:#b45309;font-weight:600;">Action required — please accept or decline this fee to move your booking forward.</p>
    </div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
      <tr><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;color:#666;">Service</td><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;font-weight:600;text-align:right;">${listingTitle}</td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;color:#666;">Event Date</td><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;font-weight:600;text-align:right;">${eventDate}</td></tr>
      <tr><td style="padding:8px 0;font-size:14px;color:#666;">${feeLabelCap}</td><td style="padding:8px 0;font-size:14px;font-weight:700;text-align:right;color:${CORAL};">${amountFmt}</td></tr>
    </table>
    <a href="${dashboardUrl}" style="display:inline-block;background:${CORAL};color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:14px;font-weight:600;">Review Fee</a>
  `;

  const text = [
    `${feeLabelCap} Proposed`,
    ``,
    `Hi ${recipientName},`,
    ``,
    `${vendorName} has proposed a ${feeLabel} of ${amountFmt} for your booking on ${eventDate}.`,
    ...(reason ? [``, `Vendor note: "${reason}"`] : []),
    ``,
    `Service: ${listingTitle}`,
    `Event Date: ${eventDate}`,
    `${feeLabelCap}: ${amountFmt}`,
    ``,
    `Review your booking: ${dashboardUrl}`,
  ].join("\n");

  return { subject, html: baseWrapper(body), text };
}
