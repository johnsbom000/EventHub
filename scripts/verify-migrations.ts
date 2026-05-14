#!/usr/bin/env node
import * as dotenv from 'dotenv';
dotenv.config();

async function verify() {
  const { db } = await import('../server/db');
  const { sql } = await import('drizzle-orm');
  const checks = [
    { label: 'stripe_customer_id on users', expect: 'found', q: sql`SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name='stripe_customer_id'` },
    { label: 'dispute_type on booking_disputes', expect: 'found', q: sql`SELECT column_name FROM information_schema.columns WHERE table_name='booking_disputes' AND column_name='dispute_type'` },
    { label: 'payment_schedules table is gone', expect: 'not found', q: sql`SELECT table_name FROM information_schema.tables WHERE table_name='payment_schedules'` },
    { label: 'schedule_id gone from payments', expect: 'not found', q: sql`SELECT column_name FROM information_schema.columns WHERE table_name='payments' AND column_name='schedule_id'` },
    { label: 'payment_schedule_id gone from travel_fee_proposals', expect: 'not found', q: sql`SELECT column_name FROM information_schema.columns WHERE table_name='travel_fee_proposals' AND column_name='payment_schedule_id'` },
    { label: 'deposit_required gone from vendor_cancellation_policies', expect: 'not found', q: sql`SELECT column_name FROM information_schema.columns WHERE table_name='vendor_cancellation_policies' AND column_name='deposit_required'` },
    { label: 'dispute_cases table exists', expect: 'found', q: sql`SELECT table_name FROM information_schema.tables WHERE table_name='dispute_cases'` },
    { label: 'dispute_filings table exists', expect: 'found', q: sql`SELECT table_name FROM information_schema.tables WHERE table_name='dispute_filings'` },
  ];

  const jsonbChecks = [
    { label: 'booking snapshots with deposit_required key (expect 0)', q: sql`SELECT COUNT(*)::int AS n FROM bookings WHERE cancellation_policy_snapshot ? 'deposit_required'` },
    { label: 'listing overrides with deposit_required key (expect 0)', q: sql`SELECT COUNT(*)::int AS n FROM vendor_listings WHERE cancellation_policy_override ? 'deposit_required'` },
  ];

  let pass = 0; let fail = 0;

  for (const c of checks) {
    const rows = await db.execute(c.q);
    const found = rows.rows.length > 0;
    const ok = c.expect === 'found' ? found : !found;
    const icon = ok ? '✓' : '✗';
    console.log(`${icon} ${c.label}: ${found ? 'found' : 'not found'} (expected ${c.expect})`);
    ok ? pass++ : fail++;
  }

  for (const c of jsonbChecks) {
    const rows = await db.execute(c.q);
    const n = (rows.rows[0] as any)?.n ?? -1;
    const ok = n === 0;
    console.log(`${ok ? '✓' : '✗'} ${c.label}: ${n}`);
    ok ? pass++ : fail++;
  }

  console.log(`\n${pass} passed, ${fail} failed.`);
  process.exit(fail > 0 ? 1 : 0);
}

verify().catch((e) => { console.error(e); process.exit(1); });
