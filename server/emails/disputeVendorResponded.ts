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

export interface DisputeVendorRespondedParams {
  recipientName: string;
  vendorBusinessName: string;
  listingTitle: string;
  eventDate: string;
  /** The vendor's response text — shown verbatim to the customer. */
  vendorResponse: string;
  serverUrl: string;
}

export function disputeVendorRespondedTemplate(params: DisputeVendorRespondedParams): {
  subject: string;
  html: string;
  text: string;
} {
  const {
    recipientName,
    vendorBusinessName,
    listingTitle,
    eventDate,
    vendorResponse,
    serverUrl,
  } = params;

  const dashboardUrl = `${serverUrl}/dashboard/events`;

  const body = `
    <div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:6px;padding:14px 18px;margin-bottom:24px;">
      <p style="margin:0;font-size:13px;color:${AMBER};font-weight:600;">Dispute Update — Vendor Has Responded</p>
    </div>
    <h2 style="margin:0 0 16px;font-family:'Playfair Display',Georgia,serif;font-size:22px;color:${SLATE};">The vendor has responded to your dispute</h2>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Hi ${recipientName},</p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;"><strong>${vendorBusinessName}</strong> has submitted a response to your dispute. Our team is reviewing both sides and will reach out with a decision within 2 business days.</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
      <tr><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;color:#666;">Service</td><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;font-weight:600;text-align:right;">${listingTitle}</td></tr>
      <tr><td style="padding:8px 0;font-size:14px;color:#666;">Event Date</td><td style="padding:8px 0;font-size:14px;font-weight:600;text-align:right;">${eventDate}</td></tr>
    </table>
    <div style="background:#F8F7F5;border-radius:6px;padding:14px 18px;margin-bottom:24px;">
      <p style="margin:0 0 6px;font-size:12px;color:#999;text-transform:uppercase;letter-spacing:0.5px;">Vendor's Response</p>
      <p style="margin:0;font-size:14px;line-height:1.6;color:#333;">${vendorResponse}</p>
    </div>
    <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#666;">No action is needed from you at this time. We'll notify you once a decision has been made.</p>
    <a href="${dashboardUrl}" style="display:inline-block;background:${CORAL};color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:14px;font-weight:600;">View Dashboard</a>
  `;

  const text = [
    `Dispute Update — Vendor Has Responded`,
    ``,
    `Hi ${recipientName},`,
    ``,
    `${vendorBusinessName} has submitted a response to your dispute. Our team will review both sides and reach out with a decision within 2 business days.`,
    ``,
    `Service: ${listingTitle}`,
    `Event Date: ${eventDate}`,
    ``,
    `Vendor's Response:`,
    vendorResponse,
    ``,
    `No action needed from you right now.`,
    ``,
    `View your dashboard: ${dashboardUrl}`,
  ].join("\n");

  return {
    subject: "Update on your EventHub dispute — vendor has responded",
    html: baseWrapper(body),
    text,
  };
}
