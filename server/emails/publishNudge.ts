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
      <p style="margin:0;font-size:12px;color:#999;">© EventHub. You received this because you created a vendor account on EventHub.</p>
    </div>
  </div>
</div>`.trim();
}

export interface PublishNudgeParams {
  businessName: string;
  /** The vendor's public storefront slug, e.g. "gilded-heirloom-rentals". */
  shopSlug: string;
  serverUrl: string;
}

/**
 * Sent to a vendor who signed up but has no active listing.
 *
 * The hook is that their storefront ALREADY exists — the slug is allocated at
 * signup, not at publish — so this is about switching on something they own
 * rather than starting a chore. `/api/vendors/public/:slug/shop` returns 200
 * with the business name and an empty listings array for these vendors, so the
 * link resolves to a real page rather than a 404.
 *
 * Deliberately makes NO pricing claim. Recipients are split across both live
 * pricing arms (subscription and commission), so any statement about monthly
 * fees or Pro would be false for roughly half of them. See usePricingModel.
 */
export function publishNudgeTemplate(params: PublishNudgeParams): {
  subject: string;
  html: string;
  text: string;
} {
  const { businessName, shopSlug, serverUrl } = params;
  const storefrontUrl = `${serverUrl}/shop/${shopSlug}`;
  // Shown without the scheme so the link reads as a shareable handle rather
  // than a raw URL — this is the thing we are asking them to put in a bio.
  const storefrontLabel = storefrontUrl.replace(/^https?:\/\//, "");

  const subject = `Your EventHub storefront just needs a listing`;

  const body = `
    <h2 style="margin:0 0 16px;font-family:'Playfair Display',Georgia,serif;font-size:22px;color:${SLATE};">Your storefront is ready, it just needs a listing</h2>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Hi ${businessName},</p>
    <p style="margin:0 0 18px;font-size:15px;line-height:1.6;">
      Your EventHub storefront is already live at
      <a href="${storefrontUrl}" style="color:${CORAL};font-weight:600;text-decoration:none;">${storefrontLabel}</a>.
      Right now it's empty, and one listing is all it takes to turn it on.
    </p>
    <p style="margin:0 0 22px;font-size:15px;line-height:1.6;">
      Once you post one, that link is yours to share. Put it in your Instagram bio, on your website, or send it to anyone who asks for pricing. It shows what you rent and lets them book you directly.
    </p>
    <a href="${serverUrl}/vendor/listings/new" style="display:inline-block;background:${CORAL};color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:14px;font-weight:600;">Post Your First Listing</a>

    <div style="margin:28px 0 0;padding:20px 0 0;border-top:1px solid #f0eeec;">
      <p style="margin:0 0 12px;font-size:15px;line-height:1.6;font-weight:600;color:${SLATE};">And if you haven't, I'd really like to know why!</p>
      <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">
        We're a small team, small enough that I read every reply myself. If the setup was confusing, if something didn't work, or if EventHub is missing something your business actually needs, tell me.
      </p>
      <p style="margin:0;font-size:15px;line-height:1.6;">
        That's genuinely what shapes what we build next, and I'd much rather hear it than guess. Just hit reply and send your honest feedback!
      </p>
    </div>

    <p style="margin:26px 0 0;font-size:15px;line-height:1.6;">
      Boman J.<br>
      <span style="color:${SLATE};">Founder, EventHub</span>
    </p>
  `;

  const text = [
    `Your storefront is ready, it just needs a listing`,
    ``,
    `Hi ${businessName},`,
    ``,
    `Your EventHub storefront is already live at ${storefrontLabel}. Right now it's empty, and one listing is all it takes to turn it on.`,
    ``,
    `Once you post one, that link is yours to share. Put it in your Instagram bio, on your website, or send it to anyone who asks for pricing. It shows what you rent and lets them book you directly.`,
    ``,
    `Post your first listing: ${serverUrl}/vendor/listings/new`,
    ``,
    `And if you haven't, I'd really like to know why!`,
    ``,
    `We're a small team, small enough that I read every reply myself. If the setup was confusing, if something didn't work, or if EventHub is missing something your business actually needs, tell me.`,
    ``,
    `That's genuinely what shapes what we build next, and I'd much rather hear it than guess. Just hit reply and send your honest feedback!`,
    ``,
    `Boman J.`,
    `Founder, EventHub`,
  ].join("\n");

  return { subject, html: baseWrapper(body), text };
}
