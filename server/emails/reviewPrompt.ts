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
      <p style="margin:0;font-size:12px;color:#999;">© EventHub. You received this because you have a booking on EventHub.</p>
    </div>
  </div>
</div>`.trim();
}

export interface ReviewPromptParams {
  customerName: string;
  vendorName: string;
  eventDate: string;
  listingTitle: string;
  bookingId: string;
  serverUrl: string;
}

export function reviewPromptTemplate(params: ReviewPromptParams): {
  subject: string;
  html: string;
  text: string;
} {
  const { customerName, vendorName, eventDate, listingTitle, bookingId, serverUrl } = params;
  const reviewUrl = `${serverUrl}/dashboard/bookings/${encodeURIComponent(bookingId)}/review`;

  const subject = `How did your event go? Leave a review for ${vendorName}`;

  const body = `
    <h2 style="margin:0 0 16px;font-family:'Playfair Display',Georgia,serif;font-size:22px;color:${SLATE};">How Was Your Event?</h2>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Hi ${customerName},</p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;">Your event on <strong>${eventDate}</strong> has passed. We hope everything went beautifully!</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
      <tr><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;color:#666;">Service</td><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;font-weight:600;text-align:right;">${listingTitle}</td></tr>
      <tr><td style="padding:8px 0;font-size:14px;color:#666;">Vendor</td><td style="padding:8px 0;font-size:14px;font-weight:600;text-align:right;">${vendorName}</td></tr>
    </table>
    <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#666;">Your review helps other couples and event hosts find amazing vendors. It only takes a minute.</p>
    <a href="${reviewUrl}" style="display:inline-block;background:${CORAL};color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:14px;font-weight:600;">Leave a Review</a>
  `;

  const text = `How Was Your Event?\n\nHi ${customerName},\n\nYour event on ${eventDate} has passed. We hope everything went beautifully!\n\nService: ${listingTitle}\nVendor: ${vendorName}\n\nLeave a review: ${reviewUrl}`;

  return { subject, html: baseWrapper(body), text };
}
