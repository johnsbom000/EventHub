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
      <p style="margin:0;font-size:12px;color:#999;">© EventHub. You received this because you started a Pro trial on EventHub.</p>
    </div>
  </div>
</div>`.trim();
}

export interface ProTrialEndingParams {
  recipientName: string;
  businessName: string;
  daysLeft: number;
  serverUrl: string;
}

export function proTrialEndingTemplate(params: ProTrialEndingParams): {
  subject: string;
  html: string;
  text: string;
} {
  const { recipientName, businessName, daysLeft, serverUrl } = params;
  const dayLabel = daysLeft === 1 ? "1 day" : `${daysLeft} days`;

  const subject = `Your EventHub Pro trial ends in ${dayLabel}`;

  const body = `
    <h2 style="margin:0 0 16px;font-family:'Playfair Display',Georgia,serif;font-size:22px;color:${SLATE};">Your Pro trial is ending soon</h2>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Hi ${recipientName},</p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;">
      Your Pro trial for <strong>${businessName}</strong> ends in <strong>${dayLabel}</strong>. Add a
      card now to keep your Pro features — unlimited listings, analytics, and Google Calendar sync.
    </p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;">
      If you don't add a card, your account will simply move to the free plan when the trial ends.
      Nothing will be charged.
    </p>
    <a href="${serverUrl}/vendor/dashboard" style="display:inline-block;background:${CORAL};color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:14px;font-weight:600;">Keep Pro — Add a Card</a>
  `;

  const text = [
    `Your Pro trial is ending soon`,
    ``,
    `Hi ${recipientName},`,
    ``,
    `Your Pro trial for ${businessName} ends in ${dayLabel}. Add a card now to keep your Pro features — unlimited listings, analytics, and Google Calendar sync.`,
    ``,
    `If you don't add a card, your account will simply move to the free plan when the trial ends. Nothing will be charged.`,
    ``,
    `Keep Pro — add a card: ${serverUrl}/vendor/dashboard`,
  ].join("\n");

  return { subject, html: baseWrapper(body), text };
}
