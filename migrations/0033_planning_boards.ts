import { sql } from "drizzle-orm";
import { db } from "../server/db";

export async function up() {
  // planning_boards: one board per event a customer is planning
  await db.execute(sql`
    create table if not exists planning_boards (
      id          varchar primary key default gen_random_uuid(),
      customer_id varchar not null references users(id),
      name        text not null,
      created_at  timestamp with time zone not null default now()
    );
  `);

  // board_saved_listings: listings saved to a board (cascade delete with board)
  await db.execute(sql`
    create table if not exists board_saved_listings (
      id         varchar primary key default gen_random_uuid(),
      board_id   varchar not null references planning_boards(id) on delete cascade,
      listing_id varchar not null references vendor_listings(id),
      saved_at   timestamp with time zone not null default now(),
      unique (board_id, listing_id)
    );
  `);

  await db.execute(sql`
    create index if not exists idx_planning_boards_customer_id
      on planning_boards (customer_id);
  `);

  await db.execute(sql`
    create index if not exists idx_board_saved_listings_board_id
      on board_saved_listings (board_id);
  `);
}

export async function down() {
  await db.execute(sql`drop table if exists board_saved_listings;`);
  await db.execute(sql`drop table if exists planning_boards;`);
}
