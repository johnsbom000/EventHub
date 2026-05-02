type EmailResult = {
  sent: boolean;
  skipped: boolean;
  reason?: string;
};

type BookingConfirmationEmailParams = {
  to: string;
  recipientName: string;
  counterpartName: string;
  eventDate: string;
  totalAmountCents: number;
  role: "customer" | "vendor";
};

type BookingStatusEmailParams = {
  recipientName: string;
  counterpartName: string;
  eventDate: string;
  listingTitle: string;
  serverUrl: string;
  role: "customer" | "vendor";
  totalAmountCents?: number;
};

type MessageEmailParams = {
  recipientName: string;
  senderName: string;
  eventDate: string;
  messagePreview: string;
  serverUrl: string;
  bookingId: string;
  recipientRole: "customer" | "vendor";
};

type ReviewPromptEmailParams = {
  customerName: string;
  vendorName: string;
  eventDate: string;
  listingTitle: string;
  bookingId: string;
  serverUrl: string;
};

function centsToUsd(amountCents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format((amountCents || 0) / 100);
}

function buildUrl(base: string, path: string): string {
  const normalizedBase = (base || "").replace(/\/$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

async function sendEmail(to: string, subject: string, html: string): Promise<EmailResult> {
  const apiKey = (process.env.RESEND_API_KEY || "").trim();
  const from = (process.env.RESEND_FROM_EMAIL || "").trim();

  if (!apiKey || !from) {
    return {
      sent: false,
      skipped: true,
      reason: "RESEND_API_KEY or RESEND_FROM_EMAIL is not configured",
    };
  }

  const recipient = (to || "").trim();
  if (!recipient) {
    return {
      sent: false,
      skipped: true,
      reason: "Recipient email is missing",
    };
  }

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [recipient],
      subject,
      html,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    return {
      sent: false,
      skipped: false,
      reason: text || `Resend returned ${resp.status}`,
    };
  }

  return { sent: true, skipped: false };
}

export async function sendBookingConfirmationEmail(
  params: BookingConfirmationEmailParams
): Promise<EmailResult> {
  const roleLine =
    params.role === "customer"
      ? `Your booking request with ${params.counterpartName} has been created.`
      : `You have a new booking request from ${params.counterpartName}.`;

  const subject =
    params.role === "customer"
      ? "Event Hub: Booking request received"
      : "Event Hub: New booking request";

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5;">
      <h2>Booking Confirmation</h2>
      <p>Hi ${params.recipientName},</p>
      <p>${roleLine}</p>
      <p><strong>Event date:</strong> ${params.eventDate}</p>
      <p><strong>Total:</strong> ${centsToUsd(params.totalAmountCents)}</p>
      <p>You can view this in your Event Hub dashboard.</p>
    </div>
  `;

  return sendEmail(params.to, subject, html);
}

export async function sendBookingConfirmedEmail(
  to: string,
  params: BookingStatusEmailParams
): Promise<EmailResult> {
  const subject =
    params.role === "customer"
      ? "Event Hub: Booking confirmed"
      : "Event Hub: Booking request confirmed";
  const dashboardPath =
    params.role === "customer"
      ? "/dashboard/events"
      : "/vendor/bookings";
  const dashboardUrl = buildUrl(params.serverUrl, dashboardPath);

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5;">
      <h2>Booking Confirmed</h2>
      <p>Hi ${params.recipientName},</p>
      <p>Your booking with ${params.counterpartName} is confirmed.</p>
      <p><strong>Listing:</strong> ${params.listingTitle}</p>
      <p><strong>Event date:</strong> ${params.eventDate}</p>
      ${
        typeof params.totalAmountCents === "number"
          ? `<p><strong>Total:</strong> ${centsToUsd(params.totalAmountCents)}</p>`
          : ""
      }
      <p><a href="${dashboardUrl}">Open your dashboard</a></p>
    </div>
  `;

  return sendEmail(to, subject, html);
}

export async function sendBookingCancelledEmail(
  to: string,
  params: BookingStatusEmailParams
): Promise<EmailResult> {
  const subject =
    params.role === "customer"
      ? "Event Hub: Booking update"
      : "Event Hub: Booking status update";
  const dashboardPath =
    params.role === "customer"
      ? "/dashboard/events"
      : "/vendor/bookings";
  const dashboardUrl = buildUrl(params.serverUrl, dashboardPath);

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5;">
      <h2>Booking Update</h2>
      <p>Hi ${params.recipientName},</p>
      <p>The booking with ${params.counterpartName} is no longer active.</p>
      <p><strong>Listing:</strong> ${params.listingTitle}</p>
      <p><strong>Event date:</strong> ${params.eventDate}</p>
      <p><a href="${dashboardUrl}">Open your dashboard</a></p>
    </div>
  `;

  return sendEmail(to, subject, html);
}

export async function sendNewMessageEmail(
  to: string,
  params: MessageEmailParams
): Promise<EmailResult> {
  const subject =
    params.recipientRole === "vendor"
      ? "Event Hub: New customer message"
      : "Event Hub: New vendor message";
  const conversationPath =
    params.recipientRole === "vendor"
      ? `/vendor/messages?bookingId=${encodeURIComponent(params.bookingId)}`
      : `/messages?bookingId=${encodeURIComponent(params.bookingId)}`;
  const conversationUrl = buildUrl(params.serverUrl, conversationPath);

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5;">
      <h2>New Message</h2>
      <p>Hi ${params.recipientName},</p>
      <p>${params.senderName} sent you a new message about your booking.</p>
      <p><strong>Event date:</strong> ${params.eventDate}</p>
      <p><strong>Message:</strong> ${params.messagePreview || "New message received."}</p>
      <p><a href="${conversationUrl}">Open conversation</a></p>
    </div>
  `;

  return sendEmail(to, subject, html);
}

export async function sendReviewPromptEmail(
  to: string,
  params: ReviewPromptEmailParams
): Promise<EmailResult> {
  const subject = "Event Hub: How was your booking?";
  const reviewUrl = buildUrl(
    params.serverUrl,
    `/dashboard/events?bookingId=${encodeURIComponent(params.bookingId)}`
  );

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5;">
      <h2>Leave a Review</h2>
      <p>Hi ${params.customerName},</p>
      <p>How did your booking with ${params.vendorName} go?</p>
      <p><strong>Listing:</strong> ${params.listingTitle}</p>
      <p><strong>Event date:</strong> ${params.eventDate}</p>
      <p><a href="${reviewUrl}">Leave your review</a></p>
    </div>
  `;

  return sendEmail(to, subject, html);
}
