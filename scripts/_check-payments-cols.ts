import * as dotenv from 'dotenv';
dotenv.config();
import { db } from '../server/db';
import { sql } from 'drizzle-orm';

const rows = await db.execute(sql`
  select column_name, data_type, is_nullable
  from information_schema.columns
  where table_name = 'payments'
  order by ordinal_position;
`);
console.log(JSON.stringify((rows as any).rows ?? rows, null, 2));
process.exit(0);
