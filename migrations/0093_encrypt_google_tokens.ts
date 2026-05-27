import { eq, or, isNotNull, sql } from "drizzle-orm";
import { db } from "../server/db";
import { vendorAccounts } from "../shared/schema";
import { encryptToken, decryptToken } from "../server/lib/tokenEncryption";

export async function up() {
  const rows = await db
    .select({
      id: vendorAccounts.id,
      googleAccessToken: vendorAccounts.googleAccessToken,
      googleRefreshToken: vendorAccounts.googleRefreshToken,
    })
    .from(vendorAccounts)
    .where(
      or(
        isNotNull(vendorAccounts.googleAccessToken),
        isNotNull(vendorAccounts.googleRefreshToken),
      )
    );

  let backfilled = 0;

  for (const row of rows) {
    const updates: Partial<{ googleAccessToken: string; googleRefreshToken: string }> = {};

    if (row.googleAccessToken) {
      try {
        decryptToken(row.googleAccessToken); // already encrypted — no-op
      } catch {
        updates.googleAccessToken = encryptToken(row.googleAccessToken);
      }
    }

    if (row.googleRefreshToken) {
      try {
        decryptToken(row.googleRefreshToken); // already encrypted — no-op
      } catch {
        updates.googleRefreshToken = encryptToken(row.googleRefreshToken);
      }
    }

    if (Object.keys(updates).length > 0) {
      await db.update(vendorAccounts).set(updates).where(eq(vendorAccounts.id, row.id));
      backfilled++;
    }
  }

  console.log(`[0093] backfilled ${backfilled} vendor Google token(s) to AES-256-GCM encryption.`);
}

export async function down() {
  // One-directional — decrypting all tokens back to plaintext is not a safe rollback.
}
