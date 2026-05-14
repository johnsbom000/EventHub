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
      <p style="margin:0;font-size:12px;color:#999;">© EventHub. You received this because you received a payout on EventHub.</p>
    </div>
  </div>
</div>`.trim();
}

export interface PayoutProcessedParams {
  recipientName: string;
  amountCents: number;
  listingTitle: string;
  eventDate: string;
  transferId?: string;
  serverUrl: string;
}

export function payoutProcessedTemplate(params: PayoutProcessedParams): {
  subject: string;
  html: string;
  text: string;
} {
  const { recipientName, amountCents, listingTitle, eventDate, transferId, serverUrl } = params;

  const subject = `EventHub: Payout of ${formatCents(amountCents)} is on its way`;

  const transferBlock = transferId
    ? `<p style="margin:0 0 24px;font-size:12px;color:#999;">Transfer ID: ${transferId}</p>`
    : "";

  const body = `
    <h2 style="margin:0 0 16px;font-family:'Playfair Display',Georgia,serif;font-size:22px;color:${SLATE};">Payout Processed</h2>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Hi ${recipientName},</p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;">
      Great news — your payout has been processed and is on its way to your connected bank account.
      Funds typically arrive within 1–2 business days depending on your bank.
    </p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
      <tr><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;color:#666;">Service</td><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;font-weight:600;text-align:right;">${listingTitle}</td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;color:#666;">Event Date</td><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;font-weight:600;text-align:right;">${eventDate}</td></tr>
      <tr><td style="padding:8px 0;font-size:15px;font-weight:700;">Payout Amount</td><td style="padding:8px 0;font-size:15px;font-weight:700;text-align:right;color:${CORAL};">${formatCents(amountCents)}</td></tr>
    </table>
    ${transferBlock}
    <a href="${serverUrl}/vendor/payments" style="display:inline-block;background:${CORAL};color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:14px;font-weight:600;">View Payment History</a>
  `;

  const text = [
    `Payout Processed`,
    ``,
    `Hi ${recipientName},`,
    ``,
    `Your payout has been processed and is on its way to your bank account.`,
    `Funds typically arrive within 1–2 business days.`,
    ``,
    `Service: ${listingTitle}`,
    `Event Date: ${eventDate}`,
    `Payout Amount: ${formatCents(amountCents)}`,
    ``,
    transferId ? `Transfer ID: ${transferId}` : "",
    ``,
    `View payment history: ${serverUrl}/vendor/payments`,
  ].filter(line => line !== undefined).join("\n");

  return { subject, html: baseWrapper(body), text };
}
