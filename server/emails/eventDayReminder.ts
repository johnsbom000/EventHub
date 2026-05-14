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
      <p style="margin:0;font-size:12px;color:#999;">© EventHub. You received this because you have an upcoming booking on EventHub.</p>
    </div>
  </div>
</div>`.trim();
}

export interface EventDayReminderParams {
  recipientName: string;
  counterpartName: string;
  listingTitle: string;
  eventDate: string;
  eventTime: string;
  eventLocation?: string;
  role: "customer" | "vendor";
  serverUrl: string;
}

export function eventDayReminderTemplate(params: EventDayReminderParams): {
  subject: string;
  html: string;
  text: string;
} {
  const { recipientName, counterpartName, listingTitle, eventDate, eventTime, eventLocation, role, serverUrl } = params;

  const subject = `EventHub: Your event is tomorrow — ${listingTitle}`;

  const intro = role === "customer"
    ? `Your booking with <strong>${counterpartName}</strong> is tomorrow. Here's everything you need to know.`
    : `You have a booking with <strong>${counterpartName}</strong> tomorrow. Make sure you're prepared.`;

  const locationRow = eventLocation
    ? `<tr><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;color:#666;">Location</td><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;font-weight:600;text-align:right;">${eventLocation}</td></tr>`
    : "";

  const dashboardUrl = role === "customer"
    ? `${serverUrl}/dashboard/events`
    : `${serverUrl}/vendor/bookings`;

  const body = `
    <h2 style="margin:0 0 16px;font-family:'Playfair Display',Georgia,serif;font-size:22px;color:${SLATE};">Event Tomorrow</h2>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Hi ${recipientName},</p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;">${intro}</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
      <tr><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;color:#666;">Service</td><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;font-weight:600;text-align:right;">${listingTitle}</td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;color:#666;">Date</td><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;font-weight:600;text-align:right;">${eventDate}</td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;color:#666;">Time</td><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;font-weight:600;text-align:right;">${eventTime}</td></tr>
      ${locationRow}
    </table>
    <a href="${dashboardUrl}" style="display:inline-block;background:${CORAL};color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:14px;font-weight:600;">View Booking Details</a>
  `;

  const text = [
    `Event Tomorrow`,
    ``,
    `Hi ${recipientName},`,
    ``,
    role === "customer"
      ? `Your booking with ${counterpartName} is tomorrow.`
      : `You have a booking with ${counterpartName} tomorrow.`,
    ``,
    `Service: ${listingTitle}`,
    `Date: ${eventDate}`,
    `Time: ${eventTime}`,
    eventLocation ? `Location: ${eventLocation}` : "",
    ``,
    `View booking details: ${dashboardUrl}`,
  ].filter(line => line !== undefined).join("\n");

  return { subject, html: baseWrapper(body), text };
}
