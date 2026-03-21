import { sql } from "drizzle-orm";
import { db } from "../server/db";

export async function up() {
  await db.execute(sql`
    update vendor_profiles vp
    set profile_name = coalesce(
      nullif(vp.online_profiles ->> 'profileBusinessName', ''),
      nullif(va.business_name, ''),
      'Vendor Profile'
    )
    from vendor_accounts va
    where va.id = vp.account_id
      and (
        vp.profile_name is null
        or btrim(vp.profile_name) = ''
        or lower(btrim(vp.profile_name)) = 'vendor profile'
      );
  `);

  await db.execute(sql`
    update vendor_profiles vp
    set online_profiles = jsonb_set(
      coalesce(vp.online_profiles, '{}'::jsonb),
      '{profileBusinessName}',
      to_jsonb(
        coalesce(
          nullif(vp.profile_name, ''),
          nullif(va.business_name, ''),
          'Vendor Profile'
        )
      ),
      true
    )
    from vendor_accounts va
    where va.id = vp.account_id
      and (
        vp.online_profiles is null
        or nullif(btrim(coalesce(vp.online_profiles ->> 'profileBusinessName', '')), '') is null
        or lower(btrim(coalesce(vp.online_profiles ->> 'profileBusinessName', ''))) = 'vendor profile'
      );
  `);
}

export async function down() {
  // Data backfill migration; intentionally no-op.
}
