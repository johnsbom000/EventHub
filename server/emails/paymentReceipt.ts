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
      <p style="margin:0;font-size:12px;color:#999;">© EventHub. You received this because you made a payment on EventHub.</p>
    </div>
  </div>
</div>`.trim();
}

export interface PaymentReceiptParams {
  recipientName: string;
  vendorName: string;
  listingTitle: string;
  eventDate: string;
  subtotalCents: number;
  platformFeeCents: number;
  totalCents: number;
  paymentIntentId: string;
  serverUrl: string;
  addOns?: Array<{ title: string; priceCents: number }>;
}

export function paymentReceiptTemplate(params: PaymentReceiptParams): {
  subject: string;
  html: string;
  text: string;
} {
  const {
    recipientName,
    vendorName,
    listingTitle,
    eventDate,
    subtotalCents,
    platformFeeCents,
    totalCents,
    paymentIntentId,
    serverUrl,
    addOns,
  } = params;

  const subject = `EventHub: Payment receipt — ${listingTitle}`;

  const body = `
    <h2 style="margin:0 0 16px;font-family:'Playfair Display',Georgia,serif;font-size:22px;color:${SLATE};">Payment Receipt</h2>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Hi ${recipientName},</p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;">
      Your payment has been processed. Here's a summary of your transaction.
    </p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
      <tr><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;color:#666;">Service</td><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;font-weight:600;text-align:right;">${listingTitle}</td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;color:#666;">Vendor</td><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;font-weight:600;text-align:right;">${vendorName}</td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;color:#666;">Event Date</td><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;font-weight:600;text-align:right;">${eventDate}</td></tr>
      ${(addOns ?? []).map(a => `<tr><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;color:#666;">${a.title}</td><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;text-align:right;">${formatCents(a.priceCents)}</td></tr>`).join("")}
      <tr><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;color:#666;">Subtotal</td><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;text-align:right;">${formatCents(subtotalCents)}</td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;color:#666;">Service Fee</td><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;text-align:right;">${formatCents(platformFeeCents)}</td></tr>
      <tr><td style="padding:8px 0;font-size:15px;font-weight:700;">Total Charged</td><td style="padding:8px 0;font-size:15px;font-weight:700;text-align:right;color:${CORAL};">${formatCents(totalCents)}</td></tr>
    </table>
    <p style="margin:0 0 24px;font-size:12px;color:#999;">Transaction ID: ${paymentIntentId}</p>
    <a href="${serverUrl}/dashboard/events" style="display:inline-block;background:${CORAL};color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:14px;font-weight:600;">View Booking</a>
  `;

  const text = [
    `Payment Receipt`,
    ``,
    `Hi ${recipientName},`,
    ``,
    `Your payment has been processed.`,
    ``,
    `Service: ${listingTitle}`,
    `Vendor: ${vendorName}`,
    `Event Date: ${eventDate}`,
    ...(addOns ?? []).map(a => `${a.title}: ${formatCents(a.priceCents)}`),
    `Subtotal: ${formatCents(subtotalCents)}`,
    `Service Fee: ${formatCents(platformFeeCents)}`,
    `Total Charged: ${formatCents(totalCents)}`,
    ``,
    `Transaction ID: ${paymentIntentId}`,
    ``,
    `View booking: ${serverUrl}/dashboard/events`,
  ].join("\n");

  return { subject, html: baseWrapper(body), text };
}
