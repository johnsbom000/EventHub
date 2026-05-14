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
      <p style="margin:0;font-size:12px;color:#999;">© EventHub. You received this because you have a vendor account on EventHub.</p>
    </div>
  </div>
</div>`.trim();
}

export interface SuspensionLiftedParams {
  recipientName: string;
  businessName: string;
  serverUrl: string;
}

export function suspensionLiftedTemplate(params: SuspensionLiftedParams): {
  subject: string;
  html: string;
  text: string;
} {
  const { recipientName, businessName, serverUrl } = params;

  const subject = "EventHub: Your account suspension has been lifted";

  const body = `
    <h2 style="margin:0 0 16px;font-family:'Playfair Display',Georgia,serif;font-size:22px;color:${SLATE};">Account Restored</h2>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Hi ${recipientName},</p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;">
      Your suspension has ended. <strong>${businessName}</strong> is active again on EventHub —
      your listings are visible and you can accept new bookings.
    </p>
    <div style="background:#f0fdf4;border-left:3px solid #16a34a;padding:12px 16px;border-radius:4px;margin-bottom:20px;">
      <p style="margin:0;font-size:13px;color:#15803d;font-weight:600;">
        Your account is fully restored. Please review our platform policies to avoid future violations.
      </p>
    </div>
    <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#555;">
      Remember: all communication and payments must stay on EventHub to protect you and your customers.
      Future policy violations may result in permanent account termination.
    </p>
    <a href="${serverUrl}/vendor/dashboard" style="display:inline-block;background:${CORAL};color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:14px;font-weight:600;">Go to Dashboard</a>
  `;

  const text = [
    `Account Restored`,
    ``,
    `Hi ${recipientName},`,
    ``,
    `Your suspension has ended. ${businessName} is active again on EventHub.`,
    `Your listings are visible and you can accept new bookings.`,
    ``,
    `Please review our platform policies to avoid future violations.`,
    `All communication and payments must stay on EventHub.`,
    ``,
    `Go to your dashboard: ${serverUrl}/vendor/dashboard`,
  ].join("\n");

  return { subject, html: baseWrapper(body), text };
}
