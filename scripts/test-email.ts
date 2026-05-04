import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

import { sendBookingConfirmedEmail } from "../server/email";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function run() {
  const to = (process.env.RESEND_TEST_TO || "").trim();
  if (!to) {
    throw new Error("Missing RESEND_TEST_TO. Example: RESEND_TEST_TO=you@example.com");
  }

  const result = await sendBookingConfirmedEmail(to, {
    recipientName: "Local Test Recipient",
    counterpartName: "Sample Vendor",
    eventDate: "2026-05-15",
    listingTitle: "Sample Photo Booth Package",
    totalAmountCents: 125000,
    bookingId: "booking-local-email-test",
    role: "customer",
    serverUrl: (process.env.SERVER_URL || "http://localhost:5001").replace(/\/$/, ""),
  });

  console.log("[test-email] sendBookingConfirmedEmail result:", result);
  if (!result.sent) {
    process.exitCode = 1;
  }
}

run().catch((error: any) => {
  console.error("[test-email] failed:", error?.message || error);
  process.exit(1);
});
