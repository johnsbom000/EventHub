/**
 * Send a PREVIEW of the founder-greeting email to one address (default: Bo's
 * personal inbox) so the copy and styling can be reviewed before any real
 * recipient sees it.
 *
 * This script never reads the database and only ever sends to the single
 * address given — it cannot mass-send.
 *
 *   npx tsx --env-file .env server/scripts/preview_founder_greeting.ts [address]
 */

import { sendViaResendRaw } from "../email";
import { founderGreetingTemplate } from "../emails/founderGreeting";

const REVIEW_INBOX = "johnsbom000@gmail.com";
const REPLY_TO = "support@eventhubglobal.com";

async function main() {
  const to = process.argv[2]?.trim() || REVIEW_INBOX;

  // Production-identical render: no [PREVIEW] tag, generic greeting — exactly
  // what a recipient with no first name on file receives. Pass a name as the
  // second argument to see the personalized variant.
  const { subject, html, text } = founderGreetingTemplate({ recipientName: process.argv[3] || null });

  console.log(`Sending production-identical preview to ${to} (reply-to ${REPLY_TO})`);
  console.log(`Subject: ${subject}\n`);

  const result = await sendViaResendRaw({ to, subject, html, text, replyTo: REPLY_TO });
  if (result.sent) {
    console.log("Preview sent.");
  } else {
    console.error(`NOT sent — ${result.reason ?? "unknown reason"}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
