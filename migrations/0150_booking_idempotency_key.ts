import { sql } from "drizzle-orm";

import { db } from "../server/db";

// What this does:
//   Adds a durable, DB-enforced idempotency key to bookings so that duplicate
//   booking-create requests (double-clicks, client retries, parallel tabs) can
//   never create two bookings for the same (customer, idempotencyKey) pair.
//
//   Before this migration idempotency was JS-only: the create handler did a
//   pre-SELECT against booking_items.item_data->>'idempotencyKey' and returned
//   the existing booking if found. That is a check-then-act race — two requests
//   with the same key that both pass the pre-SELECT will both insert. The
//   handler now also takes a per-key advisory lock inside the transaction and
//   catches the 23505 unique violation this partial index raises, re-selecting
//   and returning the winning booking.
//
//   Column: bookings.idempotency_key (text, nullable — legacy bookings stay NULL).
//   Index:  partial UNIQUE on (customer_id, idempotency_key) WHERE key IS NOT NULL,
//           so multiple NULL rows are always allowed and only real keys collide.
//
//   No backfill: existing bookings keep NULL and are unaffected (NULLs are exempt
//   from the partial unique). New bookings write the key going forward.
//
// Idempotent: ADD COLUMN IF NOT EXISTS + CREATE UNIQUE INDEX IF NOT EXISTS.

export async function up() {
  await db.execute(sql`
    alter table bookings
      add column if not exists idempotency_key text;
  `);

  await db.execute(sql`
    create unique index if not exists bookings_customer_idempotency_key_unique_idx
      on bookings (customer_id, idempotency_key)
      where idempotency_key is not null;
  `);

  console.log(
    "[0150] bookings.idempotency_key added; partial unique (customer_id, idempotency_key) installed."
  );
}

export async function down() {
  await db.execute(sql`
    drop index if exists bookings_customer_idempotency_key_unique_idx;
  `);
  await db.execute(sql`
    alter table bookings
      drop column if exists idempotency_key;
  `);
  console.log("[0150] down: bookings.idempotency_key dropped.");
}
