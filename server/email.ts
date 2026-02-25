type BookingConfirmationEmailParams = {
  to: string;
  recipientName: string;
  counterpartName: string;
  eventDate: string;
  totalAmountCents: number;
  role: "customer" | "vendor";
};

type EmailResult = {
  sent: boolean;
  skipped: boolean;
  reason?: string;
};

function centsToUsd(amountCents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format((amountCents || 0) / 100);
}

export async function sendBookingConfirmationEmail(
  params: BookingConfirmationEmailParams
): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !from) {
    return {
      sent: false,
      skipped: true,
      reason: "RESEND_API_KEY or RESEND_FROM_EMAIL is not configured",
    };
  }

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

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [params.to],
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
