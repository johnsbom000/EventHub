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

  // Render with a sample first name so the personalization is visible in review.
  const { subject, html, text } = founderGreetingTemplate({ recipientName: "Karen" });

  console.log(`Sending PREVIEW to ${to} (reply-to ${REPLY_TO})`);
  console.log(`Subject: ${subject}\n`);

  const result = await sendViaResendRaw({ to, subject: `[PREVIEW] ${subject}`, html, text, replyTo: REPLY_TO });
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
