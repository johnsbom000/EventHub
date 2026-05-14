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

function starRating(rating: number): string {
  const filled = "★".repeat(Math.max(0, Math.min(5, rating)));
  const empty = "☆".repeat(5 - Math.max(0, Math.min(5, rating)));
  return `<span style="font-size:20px;color:${CORAL};">${filled}</span><span style="font-size:20px;color:#ddd;">${empty}</span>`;
}

export interface NewReviewReceivedParams {
  recipientName: string;
  reviewerName: string;
  listingTitle: string;
  rating: number;
  reviewText?: string;
  serverUrl: string;
}

export function newReviewReceivedTemplate(params: NewReviewReceivedParams): {
  subject: string;
  html: string;
  text: string;
} {
  const { recipientName, reviewerName, listingTitle, rating, reviewText, serverUrl } = params;

  const subject = `EventHub: New ${rating}-star review for ${listingTitle}`;

  const reviewBlock = reviewText
    ? `<div style="background:#f9f9f9;border-left:3px solid ${CORAL};padding:12px 16px;border-radius:4px;margin:16px 0;font-size:14px;color:#555;font-style:italic;">"${reviewText}"</div>`
    : "";

  const body = `
    <h2 style="margin:0 0 16px;font-family:'Playfair Display',Georgia,serif;font-size:22px;color:${SLATE};">New Review Received</h2>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Hi ${recipientName},</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
      <strong>${reviewerName}</strong> left a review for <strong>${listingTitle}</strong>.
    </p>
    <div style="margin-bottom:16px;">${starRating(rating)}</div>
    ${reviewBlock}
    <p style="margin:16px 0 24px;font-size:14px;line-height:1.6;color:#555;">
      Reviews help future customers find and trust your services. View your full review history from your dashboard.
    </p>
    <a href="${serverUrl}/vendor/reviews" style="display:inline-block;background:${CORAL};color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:14px;font-weight:600;">View Reviews</a>
  `;

  const stars = "★".repeat(rating) + "☆".repeat(5 - rating);
  const text = [
    `New Review Received`,
    ``,
    `Hi ${recipientName},`,
    ``,
    `${reviewerName} left a review for ${listingTitle}.`,
    ``,
    `Rating: ${stars} (${rating}/5)`,
    ``,
    reviewText ? `"${reviewText}"` : "",
    ``,
    `View your reviews: ${serverUrl}/vendor/reviews`,
  ].filter(line => line !== undefined).join("\n");

  return { subject, html: baseWrapper(body), text };
}
