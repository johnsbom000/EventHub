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
      <p style="margin:0;font-size:12px;color:#999;">© EventHub. You received this because you have an account on EventHub.</p>
    </div>
  </div>
</div>`.trim();
}

export interface AccountSuspendedParams {
  recipientName: string;
  suspensionEndsAt: string; // formatted date string
  reason?: string;
  serverUrl: string;
}

export function accountSuspendedTemplate(params: AccountSuspendedParams): {
  subject: string;
  html: string;
  text: string;
} {
  const { recipientName, suspensionEndsAt, reason, serverUrl } = params;

  const subject = "EventHub: Your account has been suspended";

  const reasonBlock = reason
    ? `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#555;"><strong>Reason:</strong> ${reason}</p>`
    : "";

  const body = `
    <h2 style="margin:0 0 16px;font-family:'Playfair Display',Georgia,serif;font-size:22px;color:${SLATE};">Account Suspended</h2>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Hi ${recipientName},</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
      Your EventHub vendor account has been suspended due to repeated policy violations.
    </p>
    ${reasonBlock}
    <div style="background:#fef2f2;border-left:3px solid #dc2626;padding:12px 16px;border-radius:4px;margin-bottom:20px;">
      <p style="margin:0;font-size:13px;color:#991b1b;font-weight:600;">
        Your listings are hidden and you cannot accept new bookings until your suspension ends on <strong>${suspensionEndsAt}</strong>.
      </p>
    </div>
    <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#555;">
      All existing confirmed bookings will continue as normal. If you believe this suspension was made in error,
      please contact our support team.
    </p>
    <a href="mailto:support@eventhub.com" style="display:inline-block;background:${CORAL};color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:14px;font-weight:600;">Contact Support</a>
  `;

  const text = [
    `Account Suspended`,
    ``,
    `Hi ${recipientName},`,
    ``,
    `Your EventHub vendor account has been suspended due to repeated policy violations.`,
    ``,
    reason ? `Reason: ${reason}` : "",
    ``,
    `Your listings are hidden and you cannot accept new bookings until your suspension ends on ${suspensionEndsAt}.`,
    ``,
    `All existing confirmed bookings will continue as normal.`,
    ``,
    `If you believe this was made in error, contact: support@eventhub.com`,
  ].filter(line => line !== undefined).join("\n");

  return { subject, html: baseWrapper(body), text };
}
