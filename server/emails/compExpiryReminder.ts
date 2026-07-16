const CORAL = "#E07A6A";
const SLATE = "#4A6A7D";
const BG = "#FAF9F7";
const TEXT = "#1C1C1C";

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
      <p style="margin:0;font-size:12px;color:#999;">© EventHub. You received this because you have complimentary Pro on EventHub.</p>
    </div>
  </div>
</div>`.trim();
}

export interface CompExpiryReminderParams {
  recipientName: string;
  businessName: string;
  daysLeft: number;
  serverUrl: string;
}

export function compExpiryReminderTemplate(params: CompExpiryReminderParams): {
  subject: string;
  html: string;
  text: string;
} {
  const { recipientName, businessName, daysLeft, serverUrl } = params;
  const dayLabel = daysLeft === 1 ? "tomorrow" : `in ${daysLeft} days`;
  const dayLabelPlain = daysLeft === 1 ? "1 day" : `${daysLeft} days`;

  const subject =
    daysLeft === 1
      ? `Your free Pro ends tomorrow — add a card to keep it`
      : `Your free Pro ends in ${daysLeft} days`;

  const body = `
    <h2 style="margin:0 0 16px;font-family:'Playfair Display',Georgia,serif;font-size:22px;color:${SLATE};">Your free Pro is ending ${dayLabel}</h2>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Hi ${recipientName},</p>
    <p style="margin:0 0 18px;font-size:15px;line-height:1.6;">
      Your complimentary Pro for <strong>${businessName}</strong> ends <strong>${dayLabel}</strong>.
      Add a card to keep Pro and everything stays exactly as it is today.
    </p>
    <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:${SLATE};">If you don't add a card:</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:22px;">
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #f0eeec;font-size:14px;line-height:1.5;">
          Your account moves to the <strong>Free plan</strong> — you'll lose Pro features (analytics and Google Calendar sync).
        </td>
      </tr>
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #f0eeec;font-size:14px;line-height:1.5;">
          <strong>1 listing stays active</strong>; your other listings are paused (hidden from customers, not deleted).
        </td>
      </tr>
      <tr>
        <td style="padding:10px 0;font-size:14px;line-height:1.5;">
          <strong>Nothing will be charged.</strong> You only pay if you choose to add a card and continue Pro.
        </td>
      </tr>
    </table>
    <a href="${serverUrl}/vendor/dashboard" style="display:inline-block;background:${CORAL};color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:14px;font-weight:600;">Add a Card — Keep Pro</a>
  `;

  const text = [
    `Your free Pro is ending ${dayLabel}`,
    ``,
    `Hi ${recipientName},`,
    ``,
    `Your complimentary Pro for ${businessName} ends ${dayLabel} (${dayLabelPlain}). Add a card to keep Pro and everything stays exactly as it is today.`,
    ``,
    `If you don't add a card:`,
    `• Your account moves to the Free plan — you'll lose Pro features (analytics and Google Calendar sync).`,
    `• 1 listing stays active; your other listings are paused (hidden from customers, not deleted).`,
    `• Nothing will be charged. You only pay if you choose to add a card and continue Pro.`,
    ``,
    `Add a card — keep Pro: ${serverUrl}/vendor/dashboard`,
  ].join("\n");

  return { subject, html: baseWrapper(body), text };
}
