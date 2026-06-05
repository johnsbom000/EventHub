const SLATE     = "#4A6A7D";
const GOLD      = "#c8a86e";
const GOLD_TEXT = "#c8a86e";
const FORE      = "#16222C";
const MUTED     = "#7898A2";
const BORDER    = "#DDE8EE";

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;600&family=DM+Sans:wght@300;400;500&display=swap');`;

const LOGO_URL = "https://pub-fb81e46f4a6e414b8342a1a2f1e9d59e.r2.dev/assets/eventhub_logo_transparent.png";
const MARQUEE_LOGO_URL = "https://pub-fb81e46f4a6e414b8342a1a2f1e9d59e.r2.dev/assets/eventhub_marquee_logo_transparent.png";

function logoImg(width: number, alt = "EventHub"): string {
  return `<img src="${LOGO_URL}" width="${width}" alt="${alt}" style="display:block;border:0;outline:none;text-decoration:none;" />`;
}
function brandInline(): string {
  return `<span style="font-family:'Playfair Display',Georgia,serif;font-weight:700;">EventHub</span>`;
}

const BENEFITS = [
  {
    title: "Fee Holiday: 0% platform fee",
    desc: "Keep 100% of your earliest bookings. No platform commission while the holiday is active.",
  },
  {
    title: "The Marquee Rate: 6% instead of 8%",
    desc: "After the holiday, your platform fee settles at just 6% for 24 months.",
  },
  {
    title: "Lower Fees for Your Customers: 2.5% vs 5%",
    desc: 'Your listings carry a "Lower Fees" badge, so you are the better deal when couples compare.',
  },
  {
    title: "Launch Visibility: top placement + spotlight",
    desc: "Guaranteed top placement in your area's search, plus a feature to our email list and socials.",
  },
  {
    title: "White-Glove Onboarding",
    desc: "We offer to build your first listing and sync your calendar with you. Setup takes about 10 minutes.",
  },
  {
    title: "Insider Circle",
    desc: "Early access to features and a say in the roadmap.",
  },
  {
    title: "Refer a Vendor, Earn Free Bookings",
    desc: "For every vendor you refer who publishes a listing, earn 5 additional bookings at half the normal fee.",
  },
];

const DEFAULT_APP_URL = "https://eventhubglobal.com";

function benefitRows(): string {
  return BENEFITS.map((b, i) => `
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
           style="margin-bottom:8px;border:1px solid ${BORDER};border-radius:8px;background:#fff;">
      <tr>
        <td width="32" valign="top"
            style="padding:14px 0 14px 16px;font-family:'Cormorant Garamond',Georgia,'Times New Roman',serif;
                   font-size:17px;color:${GOLD};line-height:1;">
          ${i + 1}
        </td>
        <td valign="top" style="padding:14px 14px 14px 10px;">
          <p style="margin:0 0 5px;font-family:'Cormorant Garamond',Georgia,'Times New Roman',serif;
                    font-size:16px;font-weight:400;color:${FORE};line-height:1.3;">
            ${b.title}
          </p>
          <p style="margin:0;font-family:'DM Sans',Arial,Helvetica,sans-serif;
                    font-size:13px;color:${MUTED};line-height:1.6;">
            ${b.desc}
          </p>
        </td>
      </tr>
    </table>`).join("\n");
}

export interface MarqueeInviteParams {
  recipientEmail: string;
  appBaseUrl?: string;
  inviteToken?: string;
}

export function marqueeInviteTemplate(params: MarqueeInviteParams): {
  subject: string;
  html: string;
  text: string;
} {
  const baseUrl = (params.appBaseUrl || DEFAULT_APP_URL).replace(/\/$/, "");
  const agreementUrl = `${baseUrl}/vendor/marquee`;
  const ctaUrl = params.inviteToken
    ? `${baseUrl}/?mv=${params.inviteToken}`
    : `${baseUrl}/`;

  const subject = "You're invited: The EventHub Marquee Vendor Program";

  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <!--[if !mso]><!-->
  <style>${FONTS}</style>
  <!--<![endif]-->
</head>
<body style="margin:0;padding:0;background:#FAF9F7;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">

<div style="background:#FAF9F7;padding:40px 0;font-family:'DM Sans',Arial,Helvetica,sans-serif;color:${FORE};">
<div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;
            box-shadow:0 1px 4px rgba(0,0,0,0.08);">

  <!-- Hero -->
  <div style="background:#FDFBF5;padding:44px 32px 36px;text-align:center;
              border-bottom:1px solid ${BORDER};">
    <div style="margin-bottom:18px;"><table align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><img src="${MARQUEE_LOGO_URL}" width="240" alt="EventHub" style="display:block;border:0;outline:none;text-decoration:none;" /></td></tr></table></div>
    <p style="margin:0 0 16px;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:10px;
              font-weight:700;text-transform:uppercase;letter-spacing:2.5px;color:${GOLD_TEXT};">
      LAUNCH OFFER &middot; BY INVITATION
    </p>
    <p style="margin:0 0 10px;font-family:'Cormorant Garamond',Georgia,'Times New Roman',serif;
              font-size:28px;font-weight:400;line-height:1.2;color:${FORE};">
      The Marquee Vendor Program
    </p>
    <!-- Gold divider -->
    <table align="center" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 20px;">
      <tr>
        <td width="56" height="2" bgcolor="${GOLD}"
            style="font-size:2px;line-height:2px;mso-line-height-rule:exactly;">&nbsp;</td>
      </tr>
    </table>
    <p style="margin:0 0 20px;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:14px;
              line-height:1.7;color:${MUTED};max-width:460px;margin-left:auto;margin-right:auto;">
      Claim the best deal we will ever offer,
      built to put more bookings, and more of each booking, in your pocket.
    </p>
    <p style="margin:0;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:13px;color:${MUTED};">
      <span style="display:inline-block;width:8px;height:8px;background:rgb(34,197,94);
                   border-radius:50%;vertical-align:middle;margin-right:6px;"></span>
      By invitation only. Reserved for the first 20 vendors we invite.
    </p>
  </div>

  <!-- Value props -->
  <div style="padding:28px 32px;border-bottom:1px solid ${BORDER};">
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td width="33%" valign="top" style="padding:0 16px 0 0;">
          <p style="margin:0 0 6px;font-family:'Cormorant Garamond',Georgia,'Times New Roman',serif;
                    font-size:19px;font-weight:400;color:${FORE};">Keep more</p>
          <p style="margin:0;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:13px;
                    color:${MUTED};line-height:1.6;">A fee holiday to start, then a rate
            that stays below standard.</p>
        </td>
        <td width="33%" valign="top"
            style="padding:0 16px;border-left:1px solid ${BORDER};">
          <p style="margin:0 0 6px;font-family:'Cormorant Garamond',Georgia,'Times New Roman',serif;
                    font-size:19px;font-weight:400;color:${FORE};">Book more</p>
          <p style="margin:0;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:13px;
                    color:${MUTED};line-height:1.6;">Top placement and a marketing
            spotlight while you grow.</p>
        </td>
        <td width="33%" valign="top"
            style="padding:0 0 0 16px;border-left:1px solid ${BORDER};">
          <p style="margin:0 0 6px;font-family:'Cormorant Garamond',Georgia,'Times New Roman',serif;
                    font-size:19px;font-weight:400;color:${FORE};">Belong</p>
          <p style="margin:0;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:13px;
                    color:${MUTED};line-height:1.6;">A seat in the Insider Circle, with
            first access to everything new.</p>
        </td>
      </tr>
    </table>
  </div>

  <!-- Benefits heading + dates & deadlines link -->
  <div style="padding:28px 32px 12px;">
    <p style="margin:0 0 5px;font-family:'Cormorant Garamond',Georgia,'Times New Roman',serif;
              font-size:24px;font-weight:400;color:${FORE};">Your Benefits</p>
    <p style="margin:0;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:12px;color:${MUTED};">
      Full terms, timelines &amp; conditions:
      <a href="${agreementUrl}"
         style="color:${GOLD_TEXT};text-decoration:underline;">dates &amp; deadlines &rarr;</a>
    </p>
  </div>

  <!-- Benefits list -->
  <div style="padding:0 32px 28px;">
    ${benefitRows()}
  </div>

  <!-- Sunset -->
  <div style="padding:24px 32px;border-top:1px solid ${BORDER};border-bottom:1px solid ${BORDER};">
    <p style="margin:0 0 16px;font-family:'Cormorant Garamond',Georgia,'Times New Roman',serif;
              font-size:24px;font-weight:400;color:${FORE};">How the Program Sunsets</p>
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:12px;">
      <tr>
        <td width="18" valign="top"
            style="font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:14px;
                   color:${SLATE};padding-top:1px;font-weight:700;">
          &#9632;
        </td>
        <td style="font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:13px;
                   color:${MUTED};line-height:1.65;">
          Enrollment is by invitation only and closes once all 20 invited spots are claimed.
        </td>
      </tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td width="18" valign="top"
            style="font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:14px;
                   color:${SLATE};padding-top:1px;font-weight:700;">
          &#9632;
        </td>
        <td style="font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:13px;
                   color:${MUTED};line-height:1.65;">
          Each benefit has its own runway, set by bookings, by time, or by your market
          reaching healthy booking volume.
        </td>
      </tr>
    </table>
  </div>

  <!-- CTA -->
  <div style="padding:36px 32px;text-align:center;">
    <p style="margin:0 0 10px;font-family:'Cormorant Garamond',Georgia,'Times New Roman',serif;
              font-size:24px;font-weight:400;color:${FORE};">Claim your Marquee spot</p>
    <p style="margin:0 0 24px;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:13px;
              color:${MUTED};line-height:1.65;">
      Create your vendor account, publish your first listing, and your perks go live instantly.
    </p>
    <a href="${ctaUrl}"
       style="display:inline-block;background:${GOLD};color:#1C1100;text-decoration:none;
              padding:13px 32px;border-radius:6px;font-family:'DM Sans',Arial,Helvetica,sans-serif;
              font-size:14px;font-weight:700;border:1px solid #B0882C;letter-spacing:0.01em;">
      Become a Marquee Vendor &rarr;
    </a>
  </div>

  <!-- Footer -->
  <div style="padding:18px 32px;border-top:1px solid #f0eeec;text-align:center;">
    <table align="center" cellpadding="0" cellspacing="0" border="0"><tr><td>${logoImg(100)}</td></tr></table>
    <p style="margin:6px 0 0;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:11px;color:#aaa;">
      This invitation was sent by the ${brandInline()} team.
    </p>
  </div>

</div>
</div>

</body>
</html>`;

  const text = [
    "THE MARQUEE VENDOR PROGRAM",
    "LAUNCH OFFER · BY INVITATION",
    "",
    "Claim the best deal we will ever offer, built to put more bookings, and more of each booking, in your pocket.",
    "",
    "By invitation only. Reserved for the first 20 vendors we invite.",
    "",
    "── YOUR BENEFITS ──",
    `Full terms, timelines & conditions: ${agreementUrl}`,
    "",
    "1. Fee Holiday: 0% platform fee",
    "   Keep 100% of your earliest bookings. No platform commission while the holiday is active.",
    "",
    "2. The Marquee Rate: 6% instead of 8%",
    "   After the holiday, your platform fee settles at just 6% for 24 months.",
    "",
    "3. Lower Fees for Your Customers: 2.5% vs 5%",
    '   Your listings carry a "Lower Fees" badge.',
    "",
    "4. Launch Visibility: top placement + spotlight",
    "   Guaranteed top placement in your area's search, plus a feature to our email list and socials.",
    "",
    "5. White-Glove Onboarding",
    "   We offer to build your first listing and sync your calendar with you.",
    "",
    "6. Insider Circle",
    "   Early access to features and a say in the roadmap.",
    "",
    "7. Refer a Vendor, Earn Free Bookings",
    "   Earn 5 bookings at 0% platform fee for every vendor you refer who publishes a listing.",
    "",
    "── HOW THE PROGRAM SUNSETS ──",
    "",
    "Enrollment closes once all 20 invited spots are claimed.",
    "Each benefit has its own runway, set by bookings, by time, or by market volume.",
    "",
    "── CLAIM YOUR SPOT ──",
    "",
    `Become a Marquee Vendor: ${ctaUrl}`,
    "",
    "© EventHub",
  ].join("\n");

  return { subject, html, text };
}
