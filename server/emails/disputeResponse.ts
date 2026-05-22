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

export interface DisputeResponseParams {
  recipientName: string;
  /** The other party's display name — vendor business name or customer name. */
  otherPartyName: string;
  listingTitle: string;
  eventDate: string;
  serverUrl: string;
}

export function disputeResponseTemplate(params: DisputeResponseParams): {
  subject: string;
  html: string;
  text: string;
} {
  const { recipientName, otherPartyName, listingTitle, eventDate, serverUrl } = params;

  const dashboardUrl = `${serverUrl}/dashboard`;

  const body = `
    <div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:6px;padding:14px 18px;margin-bottom:24px;">
      <p style="margin:0;font-size:13px;color:${AMBER};font-weight:600;">Dispute Update — Response Submitted</p>
    </div>
    <h2 style="margin:0 0 16px;font-family:'Playfair Display',Georgia,serif;font-size:22px;color:${SLATE};">The other party has responded to your dispute</h2>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Hi ${recipientName},</p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;"><strong>${otherPartyName}</strong> has submitted a response to your dispute. Our team is now reviewing both sides and will reach out with a decision within 2 business days.</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
      <tr><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;color:#666;">Service</td><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;font-weight:600;text-align:right;">${listingTitle}</td></tr>
      <tr><td style="padding:8px 0;font-size:14px;color:#666;">Event Date</td><td style="padding:8px 0;font-size:14px;font-weight:600;text-align:right;">${eventDate}</td></tr>
    </table>
    <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#666;">You can view the full dispute thread — including their response — from your disputes dashboard. No further action is needed from you at this time.</p>
    <a href="${dashboardUrl}" style="display:inline-block;background:${CORAL};color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:14px;font-weight:600;">View Disputes</a>
  `;

  const text = [
    `Dispute Update — Response Submitted`,
    ``,
    `Hi ${recipientName},`,
    ``,
    `${otherPartyName} has submitted a response to your dispute. Our team is reviewing both sides and will reach out with a decision within 2 business days.`,
    ``,
    `Service: ${listingTitle}`,
    `Event Date: ${eventDate}`,
    ``,
    `You can view the full dispute thread from your disputes dashboard.`,
    ``,
    `View your dashboard: ${dashboardUrl}`,
  ].join("\n");

  return {
    subject: `Dispute update — ${otherPartyName} has responded`,
    html: baseWrapper(body),
    text,
  };
}
