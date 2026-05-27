#!/usr/bin/env node
/**
 * Event log example queries.
 * Run with: npx tsx scripts/event-queries.ts
 *
 * These queries answer the three core funnel questions:
 *   1. Where do vendors drop off in onboarding?
 *   2. What fraction of searches convert to a contact (checkout attempt)?
 *   3. Which vendors signed up 7+ days ago but have never published?
 */

import * as dotenv from "dotenv";
import { sql } from "drizzle-orm";
import { db } from "../server/db";

dotenv.config();

async function main() {
  // ── Query 1: Onboarding completion rate by step (last 7 days) ──────────────
  console.log("\n=== Onboarding completion rate by step (last 7 days) ===");
  const onboardingRows = await db.execute(sql`
    SELECT
      (properties->>'step')::int AS step,
      COUNT(*) FILTER (WHERE event_name = 'vendor_onboarding_step_viewed')    AS viewed,
      COUNT(*) FILTER (WHERE event_name = 'vendor_onboarding_step_completed') AS completed,
      ROUND(
        100.0
        * COUNT(*) FILTER (WHERE event_name = 'vendor_onboarding_step_completed')
        / NULLIF(COUNT(*) FILTER (WHERE event_name = 'vendor_onboarding_step_viewed'), 0),
        1
      ) AS completion_pct
    FROM event_log
    WHERE event_name IN ('vendor_onboarding_step_viewed', 'vendor_onboarding_step_completed')
      AND created_at > NOW() - INTERVAL '7 days'
    GROUP BY 1
    ORDER BY 1
  `);
  console.table((onboardingRows as any).rows ?? onboardingRows);

  // ── Query 2: Search-to-contact conversion rate (last 7 days) ───────────────
  console.log("\n=== Search-to-contact conversion rate (last 7 days) ===");
  const conversionRows = await db.execute(sql`
    WITH sessions AS (
      SELECT
        session_id,
        bool_or(event_name = 'search_performed')    AS did_search,
        bool_or(event_name = 'contact_form_opened') AS did_contact
      FROM event_log
      WHERE created_at > NOW() - INTERVAL '7 days'
        AND session_id IS NOT NULL
      GROUP BY session_id
    )
    SELECT
      COUNT(*) FILTER (WHERE did_search)                     AS searched,
      COUNT(*) FILTER (WHERE did_search AND did_contact)     AS converted,
      ROUND(
        100.0
        * COUNT(*) FILTER (WHERE did_search AND did_contact)
        / NULLIF(COUNT(*) FILTER (WHERE did_search), 0),
        1
      ) AS conversion_pct
    FROM sessions
  `);
  console.table((conversionRows as any).rows ?? conversionRows);

  // ── Query 3: Vendor signups with no published listing after 7+ days ────────
  console.log("\n=== Vendor signups with no listing published (7+ days old) ===");
  const noListingRows = await db.execute(sql`
    SELECT
      el.actor_id  AS vendor_account_id,
      el.created_at AS signup_at
    FROM event_log el
    WHERE el.event_name = 'vendor_signup_completed'
      AND (el.properties->>'is_new')::boolean = true
      AND el.created_at < NOW() - INTERVAL '7 days'
      AND NOT EXISTS (
        SELECT 1 FROM event_log e2
        WHERE e2.event_name = 'vendor_first_listing_published'
          AND e2.actor_id = el.actor_id
      )
    ORDER BY el.created_at
  `);
  console.table((noListingRows as any).rows ?? noListingRows);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
