const CORAL = "#E07A6A";
const SLATE = "#4A6A7D";
const BG = "#FAF9F7";
const TEXT = "#1C1C1C";

function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((cents || 0) / 100);
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
      <p style="margin:0;font-size:12px;color:#999;">© EventHub. You received this because you have a booking on EventHub.</p>
    </div>
  </div>
</div>`.trim();
}

export interface BookingCancelledParams {
  recipientName: string;
  counterpartName: string;
  eventDate: string;
  listingTitle: string;
  /** Role of the RECIPIENT (determines messaging and dashboard link). */
  role: "customer" | "vendor";
  /** Who initiated the cancellation — used for context in vendor email. */
  cancelledBy?: "customer" | "vendor" | "system";
  totalAmountCents?: number;
  refundAmountCents?: number;
  serverUrl: string;
}

export function bookingCancelledTemplate(params: BookingCancelledParams): {
  subject: string;
  html: string;
  text: string;
} {
  const {
    recipientName,
    counterpartName,
    eventDate,
    listingTitle,
    role,
    cancelledBy,
    totalAmountCents,
    refundAmountCents,
    serverUrl,
  } = params;

  const dashboardUrl = role === "vendor"
    ? `${serverUrl}/vendor/bookings`
    : `${serverUrl}/dashboard/events`;

  const subject = role === "customer"
    ? "Your EventHub booking has been cancelled"
    : "EventHub: Booking cancelled";

  const intro = role === "customer"
    ? `Your booking with <strong>${counterpartName}</strong> has been cancelled.`
    : cancelledBy === "customer"
    ? `The booking from <strong>${counterpartName}</strong> has been cancelled by the customer.`
    : `The booking from <strong>${counterpartName}</strong> has been cancelled.`;

  // Refund row — only show for the customer recipient when there's payment info
  const refundRow = role === "customer" && typeof totalAmountCents === "number"
    ? `<tr><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;color:#666;">Total Paid</td><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;font-weight:600;text-align:right;">${formatCents(totalAmountCents)}</td></tr>
       <tr><td style="padding:8px 0;font-size:14px;color:#666;">Refund Amount</td><td style="padding:8px 0;font-size:14px;font-weight:700;text-align:right;color:${refundAmountCents! > 0 ? "#16a34a" : "#666"};">${typeof refundAmountCents === "number" ? formatCents(refundAmountCents) : "None"}</td></tr>`
    : `<tr><td style="padding:8px 0;font-size:14px;color:#666;">Event Date</td><td style="padding:8px 0;font-size:14px;font-weight:600;text-align:right;">${eventDate}</td></tr>`;

  const refundNote = role === "customer" && typeof refundAmountCents === "number" && refundAmountCents > 0
    ? `<p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#555;">Your refund of <strong>${formatCents(refundAmountCents)}</strong> has been processed and will appear on your original payment method within 5–10 business days.</p>`
    : role === "customer" && typeof refundAmountCents === "number" && refundAmountCents === 0
    ? `<p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#555;">Per the cancellation policy, no refund applies for cancellations at this time.</p>`
    : "";

  const body = `
    <h2 style="margin:0 0 16px;font-family:'Playfair Display',Georgia,serif;font-size:22px;color:${SLATE};">Booking Cancelled</h2>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Hi ${recipientName},</p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;">${intro}</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
      <tr><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;color:#666;">Service</td><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;font-weight:600;text-align:right;">${listingTitle}</td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;color:#666;">Event Date</td><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;font-weight:600;text-align:right;">${eventDate}</td></tr>
      ${refundRow}
    </table>
    ${refundNote}
    <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#666;">If you have questions, you can view your booking history in your dashboard.</p>
    <a href="${dashboardUrl}" style="display:inline-block;background:${CORAL};color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:14px;font-weight:600;">View Dashboard</a>
  `;

  const refundTextLine = role === "customer" && typeof refundAmountCents === "number"
    ? `Refund: ${formatCents(refundAmountCents)}`
    : "";

  const text = [
    `Booking Cancelled`,
    ``,
    `Hi ${recipientName},`,
    ``,
    role === "customer"
      ? `Your booking with ${counterpartName} has been cancelled.`
      : `The booking from ${counterpartName} has been cancelled.`,
    ``,
    `Service: ${listingTitle}`,
    `Event Date: ${eventDate}`,
    refundTextLine,
    ``,
    `View your dashboard: ${dashboardUrl}`,
  ].filter(Boolean).join("\n");

  return { subject, html: baseWrapper(body), text };
}
