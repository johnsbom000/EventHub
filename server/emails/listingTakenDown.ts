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

export interface ListingTakenDownParams {
  recipientName: string;
  listingTitle: string;
  reason?: string;
  warningNumber?: number;
  serverUrl: string;
}

export function listingTakenDownTemplate(params: ListingTakenDownParams): {
  subject: string;
  html: string;
  text: string;
} {
  const { recipientName, listingTitle, reason, warningNumber, serverUrl } = params;

  const subject = `EventHub: Your listing "${listingTitle}" has been removed`;

  const reasonBlock = reason
    ? `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#555;"><strong>Reason:</strong> ${reason}</p>`
    : "";

  const warningNote = warningNumber
    ? `<p style="margin:0 0 16px;font-size:14px;color:#555;">This is warning <strong>${warningNumber} of 3</strong> on your account.</p>`
    : "";

  const body = `
    <h2 style="margin:0 0 16px;font-family:'Playfair Display',Georgia,serif;font-size:22px;color:${SLATE};">Listing Removed</h2>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Hi ${recipientName},</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
      Your listing <strong>"${listingTitle}"</strong> has been removed from EventHub due to a policy violation.
    </p>
    ${reasonBlock}
    ${warningNote}
    <div style="background:#fff8f0;border-left:3px solid ${CORAL};padding:12px 16px;border-radius:4px;margin-bottom:20px;">
      <p style="margin:0;font-size:13px;color:#b45309;font-weight:600;">
        All communication and payments must go through EventHub. Off-platform activity puts you and your customers at risk.
      </p>
    </div>
    <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#555;">
      If you believe this was made in error or have questions, please contact our support team.
    </p>
    <a href="mailto:support@eventhub.com" style="display:inline-block;background:${CORAL};color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:14px;font-weight:600;">Contact Support</a>
  `;

  const text = [
    `Listing Removed`,
    ``,
    `Hi ${recipientName},`,
    ``,
    `Your listing "${listingTitle}" has been removed from EventHub due to a policy violation.`,
    ``,
    reason ? `Reason: ${reason}` : "",
    warningNumber ? `This is warning ${warningNumber} of 3 on your account.` : "",
    ``,
    `All communication and payments must go through EventHub.`,
    ``,
    `Contact support: support@eventhub.com`,
  ].filter(line => line !== undefined).join("\n");

  return { subject, html: baseWrapper(body), text };
}
