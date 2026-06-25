const CORAL = "#E07A6A";
const SLATE = "#4A6A7D";
const BG = "#FAF9F7";
const TEXT = "#1C1C1C";
const GREEN = "#16a34a";
const AMBER = "#B45309";

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
  /** Optional extra sentence inserted after the intro, e.g. to explain why. */
  reasonNote?: string;
  totalAmountCents?: number;
  refundAmountCents?: number;
  // ── Itemized receipt (optional) ───────────────────────────────────────────
  // When any of these are provided, the email shows a line-by-line refund
  // summary to BOTH parties instead of the single "Refund Amount" row.
  /** Service/booking charge refunded immediately (per the cancellation policy). */
  serviceRefundCents?: number;
  /** Security deposit refunded immediately (always 100% on cancellation). */
  depositRefundCents?: number;
  /** Travel/delivery fee placed on hold for the dispute window (customer-cancel only). */
  travelFeeHeld?: {
    amountCents: number;
    /** Human-readable deadline already formatted in the event timezone, e.g. "Jun 27 at 3:14 PM". */
    refundDeadlineLabel: string;
  };
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
    reasonNote,
    totalAmountCents,
    refundAmountCents,
    serviceRefundCents,
    depositRefundCents,
    travelFeeHeld,
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

  // An itemized receipt is shown to both parties whenever any line item is provided.
  const hasItemized =
    typeof serviceRefundCents === "number" ||
    typeof depositRefundCents === "number" ||
    !!travelFeeHeld;

  const tdLabel = `padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;color:#666;`;
  const tdValue = `padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;font-weight:600;text-align:right;`;

  // ── Itemized receipt rows (preferred when provided) ────────────────────────
  const itemizedRows: string[] = [];
  if (typeof serviceRefundCents === "number") {
    itemizedRows.push(
      `<tr><td style="${tdLabel}">Service refund</td><td style="${tdValue}color:${serviceRefundCents > 0 ? GREEN : "#666"};">${serviceRefundCents > 0 ? formatCents(serviceRefundCents) : "None"}</td></tr>`
    );
  }
  if (typeof depositRefundCents === "number" && depositRefundCents > 0) {
    itemizedRows.push(
      `<tr><td style="${tdLabel}">Security deposit refund</td><td style="${tdValue}color:${GREEN};">${formatCents(depositRefundCents)}</td></tr>`
    );
  }
  if (travelFeeHeld) {
    itemizedRows.push(
      `<tr><td style="${tdLabel}">Travel / delivery fee</td><td style="${tdValue}color:${AMBER};">On hold</td></tr>`
    );
  }

  // Legacy single-row refund (for callers that don't pass itemized line items).
  const legacyRefundRow = role === "customer" && typeof totalAmountCents === "number"
    ? `<tr><td style="${tdLabel}">Total Paid</td><td style="${tdValue}">${formatCents(totalAmountCents)}</td></tr>
       <tr><td style="padding:8px 0;font-size:14px;color:#666;">Refund Amount</td><td style="padding:8px 0;font-size:14px;font-weight:700;text-align:right;color:${refundAmountCents! > 0 ? GREEN : "#666"};">${typeof refundAmountCents === "number" ? formatCents(refundAmountCents) : "None"}</td></tr>`
    : `<tr><td style="padding:8px 0;font-size:14px;color:#666;">Event Date</td><td style="padding:8px 0;font-size:14px;font-weight:600;text-align:right;">${eventDate}</td></tr>`;

  const summaryBlock = hasItemized
    ? `<h3 style="margin:0 0 8px;font-family:'Playfair Display',Georgia,serif;font-size:16px;color:${SLATE};">Refund summary</h3>
       <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">${itemizedRows.join("")}</table>`
    : "";

  // The exact held-travel sentence, shown to both parties.
  const travelHoldNote = travelFeeHeld
    ? `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:${AMBER};">Travel fee of ${formatCents(travelFeeHeld.amountCents)} is on hold and is set to be refunded to the customer on ${travelFeeHeld.refundDeadlineLabel}.</p>`
    : "";

  // Vendors who actually spent money on travel get a path to recover it.
  const vendorTravelClaimNote = travelFeeHeld && role === "vendor"
    ? `<p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#555;">If you already incurred travel costs for this booking, you can request reimbursement from the held travel fee before <strong>${travelFeeHeld.refundDeadlineLabel}</strong> from the dispute page of your dashboard.</p>`
    : "";

  const refundedTotalForNote =
    (typeof serviceRefundCents === "number" ? Math.max(0, serviceRefundCents) : 0) +
    (typeof depositRefundCents === "number" ? Math.max(0, depositRefundCents) : 0);

  // Settlement note for itemized refunds (the held line is covered by travelHoldNote).
  const itemizedSettlementNote = hasItemized && role === "customer" && refundedTotalForNote > 0
    ? `<p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#555;">Your refund of <strong>${formatCents(refundedTotalForNote)}</strong> has been processed and will appear on your original payment method within 5–10 business days.</p>`
    : "";

  // Legacy refund note (only when no itemized data was provided).
  const legacyRefundNote = !hasItemized && role === "customer" && typeof refundAmountCents === "number" && refundAmountCents > 0
    ? `<p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#555;">Your refund of <strong>${formatCents(refundAmountCents)}</strong> has been processed and will appear on your original payment method within 5–10 business days.</p>`
    : !hasItemized && role === "customer" && typeof refundAmountCents === "number" && refundAmountCents === 0
    ? `<p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#555;">Per the cancellation policy, no refund applies for cancellations at this time.</p>`
    : "";

  const body = `
    <h2 style="margin:0 0 16px;font-family:'Playfair Display',Georgia,serif;font-size:22px;color:${SLATE};">Booking Cancelled</h2>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Hi ${recipientName},</p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;">${intro}</p>
    ${reasonNote ? `<p style="margin:0 0 20px;font-size:15px;line-height:1.6;">${reasonNote}</p>` : ""}
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
      <tr><td style="${tdLabel}">Service</td><td style="${tdValue}">${listingTitle}</td></tr>
      <tr><td style="${tdLabel}">Event Date</td><td style="${tdValue}">${eventDate}</td></tr>
      ${hasItemized ? "" : legacyRefundRow}
    </table>
    ${summaryBlock}
    ${travelHoldNote}
    ${itemizedSettlementNote}
    ${vendorTravelClaimNote}
    ${legacyRefundNote}
    <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#666;">If you have questions, you can view your booking history in your dashboard.</p>
    <a href="${dashboardUrl}" style="display:inline-block;background:${CORAL};color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:14px;font-weight:600;">View Dashboard</a>
  `;

  // ── Plain-text version ─────────────────────────────────────────────────────
  const textLines: string[] = [
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
  ];

  if (hasItemized) {
    textLines.push(``, `Refund summary:`);
    if (typeof serviceRefundCents === "number") {
      textLines.push(`  Service refund: ${serviceRefundCents > 0 ? formatCents(serviceRefundCents) : "None"}`);
    }
    if (typeof depositRefundCents === "number" && depositRefundCents > 0) {
      textLines.push(`  Security deposit refund: ${formatCents(depositRefundCents)}`);
    }
    if (travelFeeHeld) {
      textLines.push(`  Travel / delivery fee: On hold`);
      textLines.push(``, `Travel fee of ${formatCents(travelFeeHeld.amountCents)} is on hold and is set to be refunded to the customer on ${travelFeeHeld.refundDeadlineLabel}.`);
      if (role === "vendor") {
        textLines.push(``, `If you already incurred travel costs for this booking, you can request reimbursement from the held travel fee before ${travelFeeHeld.refundDeadlineLabel} from the dispute page of your dashboard.`);
      }
    }
  } else if (role === "customer" && typeof refundAmountCents === "number") {
    textLines.push(`Refund: ${formatCents(refundAmountCents)}`);
  }

  textLines.push(``, `View your dashboard: ${dashboardUrl}`);

  const text = textLines.filter((line) => line !== undefined).join("\n");

  return { subject, html: baseWrapper(body), text };
}
