/**
 * reset-dev-data.ts
 *
 * Wipes all dev data from:
 *   1. Neon (Postgres) — every table except _migration_history and rental_types.
 *      The admin user (eventhubglobal@gmail.com) is preserved by re-inserting
 *      after the truncate.
 *   2. Cloudflare R2 — every object in the dev bucket.
 *
 * Does NOT touch: table structure, schema, enums, indexes, migrations, or code.
 */

import * as dotenv from "dotenv";
dotenv.config();

import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  type ObjectIdentifier,
} from "@aws-sdk/client-s3";

neonConfig.webSocketConstructor = ws;

// ── helpers ──────────────────────────────────────────────────────────────────

function require_env(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing required env var: ${key}`);
  return v;
}

function step(msg: string) {
  console.log(`\n▶  ${msg}`);
}

function ok(msg: string) {
  console.log(`   ✓  ${msg}`);
}

// ── 1. Database reset ─────────────────────────────────────────────────────────

async function resetDatabase() {
  step("Connecting to Neon database…");
  const pool = new Pool({ connectionString: require_env("DATABASE_URL") });
  const db = await pool.connect();
  ok("Connected.");

  // Snapshot the admin user before wiping
  step("Snapshotting admin user…");
  const adminRes = await db.query(
    `SELECT id, name, email, password, role, auth0_sub, display_name,
            last_login_at, default_location, created_at, updated_at
     FROM users WHERE email = 'eventhubglobal@gmail.com'`
  );
  if (adminRes.rowCount === 0) throw new Error("Admin user not found — aborting.");
  const admin = adminRes.rows[0];
  ok(`Captured admin user: ${admin.email} (id=${admin.id})`);

  // Tables to wipe — everything except _migration_history and rental_types
  const tables = [
    // leaf / junction tables first to satisfy FK order within the TRUNCATE
    "booking_disputes",
    "booking_items",
    "google_calendar_event_mappings",
    "listing_reviews",
    "listing_traffic",
    "listing_views",
    "listing_addons",
    "listing_packages",
    "messages",
    "notifications",
    "payment_schedules",
    "payments",
    "review_replies",
    "stripe_webhook_events",
    "web_traffic",
    "worker_locks",
    "ip_rate_limits",
    "vendor_availability",
    "vendor_identity_hardening_reports",
    "vendor_listings_photos_backup_2026_04_28",
    "crm_contacts",
    "crm_tasks",
    "customer_profiles",
    "playing_with_neon",
    // core tables
    "bookings",
    "events",
    "vendor_listings",
    "vendor_profiles",
    "vendor_accounts",
    "vendors",
    "users",
  ];

  step(`Truncating ${tables.length} tables with CASCADE…`);
  const tableList = tables.map((t) => `"${t}"`).join(", ");
  await db.query(`TRUNCATE TABLE ${tableList} CASCADE`);
  ok("All tables cleared.");

  // Re-insert the admin user
  step("Re-inserting admin user…");
  await db.query(
    `INSERT INTO users (id, name, email, password, role, auth0_sub, display_name,
                        last_login_at, default_location, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      admin.id,
      admin.name,
      admin.email,
      admin.password,
      admin.role,
      admin.auth0_sub,
      admin.display_name,
      admin.last_login_at,
      admin.default_location,
      admin.created_at,
      admin.updated_at,
    ]
  );
  ok(`Admin user restored: ${admin.email}`);

  db.release();
  await pool.end();
  ok("Database connection closed.");
}

// ── 2. R2 bucket reset ────────────────────────────────────────────────────────

async function resetR2Bucket() {
  step("Connecting to Cloudflare R2…");

  const s3 = new S3Client({
    region: "auto",
    endpoint: require_env("OBJECT_STORAGE_ENDPOINT"),
    credentials: {
      accessKeyId: require_env("OBJECT_STORAGE_ACCESS_KEY_ID"),
      secretAccessKey: require_env("OBJECT_STORAGE_SECRET_ACCESS_KEY"),
    },
  });

  const bucket = require_env("OBJECT_STORAGE_BUCKET");
  ok(`Bucket: ${bucket}`);

  let totalDeleted = 0;
  let continuationToken: string | undefined;

  step("Listing and deleting objects…");

  do {
    const listRes = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        ContinuationToken: continuationToken,
        MaxKeys: 1000,
      })
    );

    const objects: ObjectIdentifier[] = (listRes.Contents ?? []).map((obj) => ({
      Key: obj.Key!,
    }));

    if (objects.length === 0) {
      ok("Bucket is already empty.");
      break;
    }

    await s3.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: objects, Quiet: true },
      })
    );

    totalDeleted += objects.length;
    ok(`Deleted ${totalDeleted} objects so far…`);

    continuationToken = listRes.IsTruncated ? listRes.NextContinuationToken : undefined;
  } while (continuationToken);

  ok(`R2 bucket cleared. Total objects deleted: ${totalDeleted}`);
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔════════════════════════════════════════╗");
  console.log("║     EventHub — Dev Data Reset          ║");
  console.log("╚════════════════════════════════════════╝");

  await resetDatabase();
  await resetR2Bucket();

  console.log("\n✅  Done. Database and R2 bucket are clean.");
  console.log("   Admin account preserved: eventhubglobal@gmail.com");
  console.log("   Schema, migrations, and rental_types untouched.\n");
}

main().catch((err) => {
  console.error("\n❌  Reset failed:", err.message);
  process.exit(1);
});
